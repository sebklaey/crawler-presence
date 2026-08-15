/**
 * Server-side gate every MCP tool passes through.
 *
 * The plan is always derived from the anonymous identity and the database —
 * never from anything the caller sends. Frontend checks are cosmetic only.
 */
import { requiredPlanForTool, type CustomerPlan } from "./catalog";
import { hasEntitlement, highestPlan, normalizePlan } from "./features";
import { buildUpgradePayload, type UpgradePayload } from "./upgrade.server";

export type PlanContext = {
  plan: CustomerPlan;
  isPlatformAdmin: boolean;
  subjectHash: string | null;
};

/** Resolves the caller's plan from the pseudonymous room identity. */
export async function resolvePlanContext(
  roomToken: string | null,
  knownSubjectHash?: string | null,
): Promise<PlanContext> {
  if (!roomToken && !knownSubjectHash) return { plan: "free", isPlatformAdmin: false, subjectHash: null };
  try {
    const { resolveIdentity } = await import("../room/identity");
    const { getDb } = await import("../room/store");
    const { resolveLinkedPlan } = await import("../room/planlink");
    const identity = await resolveIdentity(
      (knownSubjectHash ? { "room/subject_hash": knownSubjectHash } : { "room/token": roomToken }) as never,
    );

    const db = await getDb();
    const [{ plan }, roles] = await Promise.all([
      resolveLinkedPlan(db, identity.subjectHash),
      db
        .from("anonymous_identities")
        .select("account_id")
        .eq("subject_hash", identity.subjectHash)
        .maybeSingle()
        .then(async ({ data }) => {
          const accountId = (data as { account_id?: string } | null)?.account_id;
          if (!accountId) return [] as Array<{ role: string }>;
          const { data: rows } = await db.from("platform_roles").select("role").eq("account_id", accountId);
          return (rows ?? []) as Array<{ role: string }>;
        }),
    ]);
    return {
      plan: normalizePlan(plan),
      isPlatformAdmin: roles.some((r) => r.role === "platform_admin"),
      subjectHash: identity.subjectHash,
    };
  } catch {
    return { plan: "free", isPlatformAdmin: false, subjectHash: null };
  }
}
/**
 * Plan of a draft session: derived from the paid publish intent (and the
 * Presence it published), never from anything the caller sends.
 */
export async function resolvePlanForSession(sessionToken: string): Promise<CustomerPlan> {
  const normalize = (value: unknown): CustomerPlan => normalizePlan(value);
  const stillActive = (status: unknown, periodEnd: unknown): boolean => {
    const s = String(status ?? "active");
    if (!["canceled", "paused", "expired"].includes(s)) return true;
    const end = periodEnd ? new Date(String(periodEnd)).getTime() : 0;
    return Boolean(end && end >= Date.now());
  };

  try {
    const { latestIntentForSession } = await import("../intents.server");
    const intent = await latestIntentForSession(sessionToken);
    if (intent && ["paid", "published"].includes(intent.status)) {
      if (stillActive(intent.subscriptionStatus, intent.currentPeriodEnd)) return normalize(intent.plan);
    }
  } catch {
    /* fall through to the published Presence lookup */
  }

  // Older / webhook-created intents are not always linked back to the draft
  // session, so a live Presence published from this session is authoritative.
  try {
    const { getDb } = await import("../room/store");
    const db = await getDb();
    const { data } = await db
      .from("published_presences")
      .select("slug, plan, status, subscription_status, current_period_end, billing_subscription_id, billing_customer_id")
      .eq("session_token", sessionToken)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as {
      slug?: string | undefined;
      plan?: string | undefined;
      status?: string | undefined;
      subscription_status?: string | undefined;
      current_period_end?: string | undefined;
      billing_subscription_id?: string | null | undefined;
      billing_customer_id?: string | null | undefined;
    } | null;
    if (!row) return "free";

    let plan: string | undefined = row.plan;
    let subscriptionStatus: string | undefined = row.subscription_status;
    let periodEnd: string | undefined = row.current_period_end;

    // A just-completed upgrade may still be in flight as a webhook — read the
    // provider state directly (throttled) so the new plan counts right away.
    // A new checkout creates a new subscription, so the whole customer is
    // reconciled, not only the subscription this Presence started with.
    if (row.slug && (row.billing_subscription_id || row.billing_customer_id)) {
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
    }


    if (row.status && !["live", "active", "published"].includes(row.status)) return "free";
    if (!stillActive(subscriptionStatus, periodEnd)) return "free";
    return normalize(plan);

  } catch {
    return "free";
  }
}




/**
 * A paid draft session is proof of entitlement. Linking it to the anonymous
 * room identity makes the plan stick for every later room_* call, so a user who
 * paid in the Presence flow never falls back to "free" inside ChatGPT.
 */
export async function linkSessionPlanToRoomToken(
  roomToken: string | null | undefined,
  sessionToken: string | null | undefined,
  knownSubjectHash?: string | null,
): Promise<CustomerPlan> {
  if ((!roomToken && !knownSubjectHash) || !sessionToken) return "free";
  try {
    const plan = await resolvePlanForSession(sessionToken);
    if (plan === "free") return "free";

    const { resolveIdentity } = await import("../room/identity");
    const { getDb } = await import("../room/store");
    const identity = await resolveIdentity(
      (knownSubjectHash ? { "room/subject_hash": knownSubjectHash } : { "room/token": roomToken }) as never,
    );
    const db = await getDb();
    const { data } = await db
      .from("published_presences")
      .select("slug")
      .eq("session_token", sessionToken)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const slug = (data as { slug?: string } | null)?.slug;
    if (!slug) return plan;

    // Idempotent and never a downgrade: an existing link keeps its plan when it
    // is higher than the one this session proves.
    const { data: existing } = await db
      .from("room_plan_links")
      .select("plan")
      .eq("subject_hash", identity.subjectHash)
      .maybeSingle();
    const merged = highestPlan(plan, (existing as { plan?: string } | null)?.plan);
    await db.from("room_plan_links").upsert(
      {
        subject_hash: identity.subjectHash,
        presence_slug: slug,
        plan: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "subject_hash" },
    );
    return merged;

  } catch {
    return "free";
  }
}

/**
 * Returns an upgrade payload when the caller may not run this tool, or null
 * when the call is allowed. Already-entitled callers never see a message.
 */
export async function checkToolAccess(input: {
  tool: string;
  roomToken?: string | null;
  sessionToken?: string | null;
  subjectHash?: string | null;
  language?: "de" | "en";
  feature?: string;
}): Promise<UpgradePayload | null> {
  const required = requiredPlanForTool(input.tool);
  if (required === "free") return null;

  if (input.sessionToken) {
    const sessionPlan = await linkSessionPlanToRoomToken(
      input.roomToken ?? null,
      input.sessionToken,
      input.subjectHash ?? null,
    );
    if (required !== "admin" && hasEntitlement(sessionPlan, required)) return null;
  }

  const ctx = await resolvePlanContext(input.roomToken ?? null, input.subjectHash ?? null);

  if (required === "admin") {
    if (ctx.isPlatformAdmin) return null;
    return buildUpgradePayload({
      tool: input.tool,
      feature: input.feature ?? input.tool,
      currentPlan: ctx.plan,
      language: input.language ?? "en",
      contextHash: ctx.subjectHash,
    });
  }
  if (ctx.isPlatformAdmin || hasEntitlement(ctx.plan, required)) return null;

  return buildUpgradePayload({
    tool: input.tool,
    feature: input.feature ?? input.tool,
    currentPlan: ctx.plan,
    language: input.language ?? "en",
    contextHash: ctx.subjectHash,
  });
}
