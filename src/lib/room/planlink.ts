/**
 * Links an anonymous room identity to a paid Crawler Presence.
 *
 * Crawler stays accountless: the only key is the Presence recovery code
 * (`<slug>~<secret>`). The raw secret is never stored — only the slug and the
 * plan that the verified Presence currently pays for.
 */
import type { Db } from "./store";

export type RoomPlanCode = "free" | "plus" | "pro" | "business";

const PAID: RoomPlanCode[] = ["plus", "pro", "business"];

function normalizePlan(value: unknown): RoomPlanCode {
  const plan = String(value ?? "").toLowerCase();
  return (PAID as string[]).includes(plan) ? (plan as RoomPlanCode) : "free";
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
  const { data: link } = await db
    .from("room_plan_links")
    .select("presence_slug")
    .eq("subject_hash", subjectHash)
    .maybeSingle();
  const slug = (link as any)?.presence_slug as string | undefined;
  if (!slug) return { plan: "free", presenceSlug: null };

  const { data: presence } = await db
    .from("published_presences")
    .select("slug, plan, status, subscription_status, current_period_end")
    .eq("slug", slug)
    .maybeSingle();

  if (!presenceIsActive(presence)) return { plan: "free", presenceSlug: slug };
  return { plan: normalizePlan((presence as any).plan), presenceSlug: slug };
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
