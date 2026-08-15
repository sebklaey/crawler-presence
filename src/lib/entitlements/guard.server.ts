/**
 * Server-side gate every MCP tool passes through.
 *
 * The plan is always derived from the anonymous identity and the database —
 * never from anything the caller sends. Frontend checks are cosmetic only.
 */
import { requiredPlanForTool, meetsPlan, type CustomerPlan } from "./catalog";
import { buildUpgradePayload, type UpgradePayload } from "./upgrade.server";

export type PlanContext = {
  plan: CustomerPlan;
  isPlatformAdmin: boolean;
  subjectHash: string | null;
};

/** Resolves the caller's plan from the pseudonymous room identity. */
export async function resolvePlanContext(roomToken: string | null): Promise<PlanContext> {
  if (!roomToken) return { plan: "free", isPlatformAdmin: false, subjectHash: null };
  try {
    const { resolveIdentity } = await import("../room/identity");
    const { getDb } = await import("../room/store");
    const { resolveLinkedPlan } = await import("../room/planlink");
    const identity = await resolveIdentity({ "room/token": roomToken } as never);
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
      plan: plan as CustomerPlan,
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
  const normalize = (value: unknown): CustomerPlan => {
    const plan = String(value ?? "free").toLowerCase();
    return (["plus", "pro", "business"].includes(plan) ? plan : "free") as CustomerPlan;
  };
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
      .select("plan, status, subscription_status, current_period_end")
      .eq("session_token", sessionToken)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as {
      plan?: string;
      status?: string;
      subscription_status?: string;
      current_period_end?: string;
    } | null;
    if (!row) return "free";
    if (row.status && !["live", "active", "published"].includes(row.status)) return "free";
    if (!stillActive(row.subscription_status, row.current_period_end)) return "free";
    return normalize(row.plan);
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
): Promise<CustomerPlan> {
  if (!roomToken || !sessionToken) return "free";
  try {
    const plan = await resolvePlanForSession(sessionToken);
    if (plan === "free") return "free";

    const { resolveIdentity } = await import("../room/identity");
    const { getDb } = await import("../room/store");
    const identity = await resolveIdentity({ "room/token": roomToken } as never);
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
    await db.from("room_plan_links").upsert(
      { subject_hash: identity.subjectHash, presence_slug: slug, plan, updated_at: new Date().toISOString() },
      { onConflict: "subject_hash" },
    );
    return plan;
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
  language?: "de" | "en";
  feature?: string;
}): Promise<UpgradePayload | null> {
  const required = requiredPlanForTool(input.tool);
  if (required === "free") return null;

  if (input.sessionToken) {
    const sessionPlan = await linkSessionPlanToRoomToken(input.roomToken ?? null, input.sessionToken);
    if (required !== "admin" && meetsPlan(sessionPlan, required)) return null;
  }

  const ctx = await resolvePlanContext(input.roomToken ?? null);
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
  if (ctx.isPlatformAdmin || meetsPlan(ctx.plan, required)) return null;

  return buildUpgradePayload({
    tool: input.tool,
    feature: input.feature ?? input.tool,
    currentPlan: ctx.plan,
    language: input.language ?? "en",
    contextHash: ctx.subjectHash,
  });
}
