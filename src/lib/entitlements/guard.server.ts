/**
 * Server-side gate every MCP tool passes through.
 *
 * All plan knowledge comes from Crawler Core V2 (`resolveAccessContext`) — the
 * one resolver that merges session, identity and Presence proofs into a single
 * effective plan. Nothing here reads a plan from caller input.
 */
import { requiredPlanForTool, type CustomerPlan } from "./catalog";
import { hasEntitlement, highestPlan } from "./features";
import { buildUpgradePayload, type UpgradePayload } from "./upgrade.server";

export type PlanContext = {
  plan: CustomerPlan;
  isPlatformAdmin: boolean;
  subjectHash: string | null;
  correlationId: string;
};

/** Resolves the caller's plan from the pseudonymous room identity. */
export async function resolvePlanContext(
  roomToken: string | null,
  knownSubjectHash?: string | null,
  sessionToken?: string | null,
): Promise<PlanContext> {
  const { resolveAccessContext, newCorrelationId } = await import("../core/access.server");
  if (!roomToken && !knownSubjectHash && !sessionToken) {
    return { plan: "free", isPlatformAdmin: false, subjectHash: null, correlationId: newCorrelationId() };
  }
  const ctx = await resolveAccessContext({
    roomToken,
    subjectHash: knownSubjectHash ?? null,
    sessionId: sessionToken ?? null,
  });
  return {
    plan: ctx.plan,
    isPlatformAdmin: ctx.isPlatformAdmin,
    subjectHash: ctx.subjectHash,
    correlationId: ctx.correlationId,
  };
}

/** Plan a draft session proves (Core V2). */
export async function resolvePlanForSession(sessionToken: string): Promise<CustomerPlan> {
  const { resolvePlanForSession: resolve } = await import("../core/access.server");
  return (await resolve(sessionToken)).plan;
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
  /** Argument-aware requirement (e.g. community room = Pro). */
  requiredPlan?: string | null;
}): Promise<UpgradePayload | null> {
  const toolRequired = requiredPlanForTool(input.tool);
  const required =
    toolRequired === "admin"
      ? "admin"
      : highestPlan(toolRequired, input.requiredPlan ?? "free");
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
    requiredPlan: required,
  });
}
