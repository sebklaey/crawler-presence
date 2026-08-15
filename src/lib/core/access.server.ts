/**
 * Crawler Core V2 — the single access resolver.
 *
 * Every tool, endpoint and page derives the caller's rights from exactly one
 * function: `resolveAccessContext()`. It merges every legitimate proof of a
 * subscription into ONE effective plan and never downgrades:
 *
 *   1. `session_id`  — a paid draft session (publish intent / published Presence)
 *   2. `room_token`  — the anonymous room identity and its linked Presence
 *   3. plan cache    — a plan proven a moment ago for the same identity
 *
 * Crawler stays accountless: all three are opaque capability values. The plan
 * is never read from anything the model sends.
 */
import { evaluateSubscription } from "../billing/subscription-state";
import { highestPlan, normalizePlan, type CustomerPlan } from "../entitlements/features";
import { notePlanForSubject, notedPlanForSubject } from "./plan-cache";

export type PlanSource = { source: "session" | "presence" | "identity" | "cache"; plan: CustomerPlan };

export type AccessContext = {
  correlationId: string;
  plan: CustomerPlan;
  planSources: PlanSource[];
  isPlatformAdmin: boolean;
  subjectHash: string | null;
  roomToken: string | null;
  sessionId: string | null;
  presenceSlug: string | null;
  /** True when a plan source could not be read (provider/DB outage). */
  degraded: boolean;
};

export function newCorrelationId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `crw_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Positive allowlist via the single subscription state machine. An
 * unrecognised status never silently becomes Free: it marks the resolution as
 * degraded so callers answer `current_plan_unknown` / temporarily unavailable.
 */
const evaluate = (status: unknown, periodEnd: unknown) =>
  evaluateSubscription({
    // A record that is already marked paid/published but carries no provider
    // status yet (webhook still in flight) counts as active — it was verified.
    status: status === null || status === undefined || status === "" ? "active" : status,
    currentPeriodEnd: periodEnd,
  });

/** Plan a draft session proves: paid intent first, then its published Presence. */
export async function resolvePlanForSession(sessionToken: string): Promise<{
  plan: CustomerPlan;
  presenceSlug: string | null;
  degraded: boolean;
}> {
  let best: CustomerPlan = "free";
  let slug: string | null = null;
  let degraded = false;

  try {
    const { latestIntentForSession } = await import("../intents.server");
    const intent = await latestIntentForSession(sessionToken);
    if (intent && ["paid", "published"].includes(intent.status)) {
      const decision = evaluate(intent.subscriptionStatus, intent.currentPeriodEnd);
      if (decision.unknown) degraded = true;
      else if (decision.grantsAccess) best = highestPlan(best, intent.plan);
    }
  } catch {
    degraded = true;
  }

  try {
    const { getDb } = await import("../room/store");
    const db = await getDb();
    const { data } = await db
      .from("published_presences")
      .select(
        "slug, plan, status, subscription_status, current_period_end, billing_subscription_id, billing_customer_id",
      )
      .eq("session_token_hash", await (await import("../mcp/presences")).hashSessionToken(sessionToken))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as {
      slug?: string;
      plan?: string;
      status?: string;
      subscription_status?: string;
      current_period_end?: string;
      billing_subscription_id?: string | null;
      billing_customer_id?: string | null;
    } | null;

    if (row?.slug) {
      slug = row.slug;
      let plan = row.plan;
      let subscriptionStatus = row.subscription_status;
      let periodEnd = row.current_period_end;

      // A checkout completed seconds ago may still be in flight as a webhook —
      // reconcile (throttled) so the new plan counts on the very next call.
      if (row.billing_subscription_id || row.billing_customer_id) {
        try {
          const { reconcilePresenceBilling } = await import("../billing-refresh.server");
          const fresh = await reconcilePresenceBilling({
            slug: row.slug,
            customerId: row.billing_customer_id,
            subscriptionId: row.billing_subscription_id,
          });
          if (fresh) {
            plan = fresh.plan ?? plan;
            subscriptionStatus = fresh.subscriptionStatus ?? subscriptionStatus;
            periodEnd = fresh.currentPeriodEnd ?? periodEnd;
          }
        } catch {
          /* provider unreachable — stored state stays authoritative */
        }
      }

      const live = !row.status || ["live", "active", "published"].includes(row.status);
      if (live) {
        const decision = evaluate(subscriptionStatus, periodEnd);
        if (decision.unknown) degraded = true;
        else if (decision.grantsAccess) best = highestPlan(best, plan);
      }
    }
  } catch {
    degraded = true;
  }

  return { plan: best, presenceSlug: slug, degraded };
}

/**
 * THE resolver. Safe to call on every tool invocation: each source fails soft,
 * so an unreachable provider or database can only ever reduce information,
 * never raise an exception into a tool answer.
 */
export async function resolveAccessContext(input: {
  roomToken?: string | null;
  sessionId?: string | null;
  subjectHash?: string | null;
}): Promise<AccessContext> {
  const correlationId = newCorrelationId();
  const roomToken = input.roomToken?.trim() || null;
  const sessionId = input.sessionId?.trim() || null;
  const sources: PlanSource[] = [];

  let subjectHash = input.subjectHash?.trim() || null;
  let presenceSlug: string | null = null;
  let plan: CustomerPlan = "free";
  let isPlatformAdmin = false;
  let degraded = false;

  if (sessionId) {
    const session = await resolvePlanForSession(sessionId);
    if (session.plan !== "free") sources.push({ source: "session", plan: session.plan });
    if (session.presenceSlug) presenceSlug = session.presenceSlug;
    if (session.degraded) degraded = true;
    plan = highestPlan(plan, session.plan);
  }

  if (!subjectHash && roomToken) {
    try {
      const { resolveIdentity } = await import("../room/identity");
      const identity = await resolveIdentity({ "room/token": roomToken } as never);
      subjectHash = identity.subjectHash;
    } catch {
      subjectHash = null;
      degraded = true;
    }
  }

  if (subjectHash) {
    const cached = notedPlanForSubject(subjectHash);
    if (cached !== "free") sources.push({ source: "cache", plan: cached });
    plan = highestPlan(plan, cached);

    try {
      const { getDb } = await import("../room/store");
      const { resolveLinkedPlan } = await import("../room/planlink");
      const db = await getDb();
      const [link, roles] = await Promise.all([
        resolveLinkedPlan(db, subjectHash),
        db
          .from("anonymous_identities")
          .select("account_id")
          .eq("subject_hash", subjectHash)
          .maybeSingle()
          .then(async ({ data }) => {
            const accountId = (data as { account_id?: string } | null)?.account_id;
            if (!accountId) return [] as Array<{ role: string }>;
            const { data: rows } = await db.from("platform_roles").select("role").eq("account_id", accountId);
            return (rows ?? []) as Array<{ role: string }>;
          }),
      ]);
      if (link.plan !== "free") sources.push({ source: "identity", plan: normalizePlan(link.plan) });
      if (link.presenceSlug) presenceSlug = presenceSlug ?? link.presenceSlug;
      plan = highestPlan(plan, link.plan);
      isPlatformAdmin = roles.some((role) => role.role === "platform_admin");
    } catch {
      degraded = true;
    }

    // Make the merged plan visible to the room library (which only knows the
    // subject hash) and durable where a Presence slug is known.
    notePlanForSubject(subjectHash, plan);
    if (plan !== "free" && presenceSlug) await persistLink(subjectHash, presenceSlug, plan);
  }

  return {
    correlationId,
    plan,
    planSources: sources,
    isPlatformAdmin,
    subjectHash,
    roomToken,
    sessionId,
    presenceSlug,
    degraded,
  };
}

/** Idempotent, never a downgrade. */
async function persistLink(subjectHash: string, presenceSlug: string, plan: CustomerPlan): Promise<void> {
  try {
    const { getDb } = await import("../room/store");
    const db = await getDb();
    const { data: existing } = await db
      .from("room_plan_links")
      .select("plan")
      .eq("subject_hash", subjectHash)
      .maybeSingle();
    const merged = highestPlan(plan, (existing as { plan?: string } | null)?.plan);
    await db.from("room_plan_links").upsert(
      {
        subject_hash: subjectHash,
        presence_slug: presenceSlug,
        plan: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "subject_hash" },
    );
  } catch {
    /* linking is best effort — the cache still carries the plan this request */
  }
}
