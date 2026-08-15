/**
 * Links an anonymous room identity to a paid Crawler Presence.
 *
 * Crawler stays accountless: the only key is the Presence recovery code
 * (`<slug>~<secret>`). The raw secret is never stored — only the slug and the
 * plan that the verified Presence currently pays for.
 */
import type { Db } from "./store";
import { normalizePlan as normalizeCentral, highestPlan } from "../entitlements/features";

export type RoomPlanCode = "free" | "plus" | "pro" | "business";

/** Single normalizer for every plan value (see entitlements/features.ts). */
function normalizePlan(value: unknown): RoomPlanCode {
  return normalizeCentral(value);
}

/** True when the presence row currently pays for its plan. */
function presenceIsActive(presence: any): boolean {
  if (!presence) return false;
  if (presence.status && !["live", "active", "published"].includes(String(presence.status))) return false;
  const subscriptionStatus = String(presence.subscription_status ?? "active");
  if (["canceled", "paused", "expired"].includes(subscriptionStatus)) {
    const end = presence.current_period_end ? new Date(presence.current_period_end).getTime() : 0;
    if (!end || end < Date.now()) return false;
  }
  return true;
}

/** Resolves the plan an anonymous identity is entitled to, or "free". */
export async function resolveLinkedPlan(db: Db, subjectHash: string): Promise<{
  plan: RoomPlanCode;
  presenceSlug: string | null;
}> {
  // Core V2: a plan proven by a draft session in this request is already known
  // for this identity even when no link row exists yet.
  const { notedPlanForSubject } = await import("../core/plan-cache");
  const noted = notedPlanForSubject(subjectHash) as RoomPlanCode;

  const { data: link } = await db
    .from("room_plan_links")
    .select("presence_slug, plan")
    .eq("subject_hash", subjectHash)
    .maybeSingle();
  const slug = (link as any)?.presence_slug as string | undefined;
  if (!slug) return { plan: noted, presenceSlug: null };


  const { data: presence } = await db
    .from("published_presences")
    .select("slug, plan, status, subscription_status, current_period_end, billing_subscription_id, billing_customer_id")
    .eq("slug", slug)
    .maybeSingle();

  // Reconcile with the payment provider (throttled) so an upgrade bought a
  // moment ago is known to ChatGPT on the very next tool call.
  let current: any = presence;
  const subscriptionId = (presence as any)?.billing_subscription_id as string | undefined;
  const customerId = (presence as any)?.billing_customer_id as string | undefined;
  if (subscriptionId || customerId) {
    const { reconcilePresenceBilling } = await import("../billing-refresh.server");
    const fresh = await reconcilePresenceBilling({ slug, customerId, subscriptionId });
    if (fresh) {
      current = {
        ...(presence as any),
        plan: fresh.plan ?? (presence as any)?.plan,
        subscription_status: fresh.subscriptionStatus ?? (presence as any)?.subscription_status,
        current_period_end: fresh.currentPeriodEnd ?? (presence as any)?.current_period_end,
      };
      if (fresh.plan) {
        await db
          .from("room_plan_links")
          .update({ plan: normalizePlan(fresh.plan), updated_at: new Date().toISOString() })
          .eq("subject_hash", subjectHash);
      }
    }
  }

  if (!presenceIsActive(current)) return { plan: noted, presenceSlug: slug };
  // Several valid plan sources may exist (link row + reconciled presence +
  // draft session): always take the highest active one, never a downgrade.
  return {
    plan: highestPlan(current.plan, (link as any)?.plan, noted) as RoomPlanCode,
    presenceSlug: slug,
  };


}

/**
 * Verifies a recovery code and links it to this anonymous identity.
 * Returns the plan that is now active, or null when the code is invalid.
 */
export async function linkPlanByRecoveryCode(
  db: Db,
  subjectHash: string,
  code: string,
): Promise<{ plan: RoomPlanCode; presenceSlug: string } | null> {
  const { parseRecoveryCode, verifyManageSecret } = await import("@/lib/mcp/presences");
  const parsed = parseRecoveryCode(code);
  if (!parsed) return null;

  let presence: any = null;
  try {
    presence = await verifyManageSecret(parsed.slug, parsed.secret);
  } catch {
    return null;
  }
  if (!presence || !presenceIsActive(presence)) return null;

  const plan = normalizePlan(presence.plan);
  await db.from("room_plan_links").upsert(
    {
      subject_hash: subjectHash,
      presence_slug: parsed.slug,
      plan,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "subject_hash" },
  );
  return { plan, presenceSlug: parsed.slug };
}
