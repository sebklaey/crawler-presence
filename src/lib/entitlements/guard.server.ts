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
 * A paid draft session is proof of entitlement. Core V2 links it to the
 * anonymous room identity, so the plan sticks for every later room_* call.
 */
export async function linkSessionPlanToRoomToken(
  roomToken: string | null | undefined,
  sessionToken: string | null | undefined,
  knownSubjectHash?: string | null,
): Promise<CustomerPlan> {
  if ((!roomToken && !knownSubjectHash) || !sessionToken) return "free";
  const { resolveAccessContext } = await import("../core/access.server");
  const ctx = await resolveAccessContext({
    roomToken: roomToken ?? null,
    sessionId: sessionToken,
    subjectHash: knownSubjectHash ?? null,
  });
  return ctx.plan;
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

  // ONE resolver — session, identity and Presence proofs are merged before any
  // decision is taken, so a Pro caller is never told to buy Plus.
  const ctx = await resolvePlanContext(
    input.roomToken ?? null,
    input.subjectHash ?? null,
    input.sessionToken ?? null,
  );

  if (required === "admin") {
    if (ctx.isPlatformAdmin) return null;
    return buildUpgradePayload({
      tool: input.tool,
      feature: input.feature ?? input.tool,
      currentPlan: ctx.plan,
      language: input.language ?? "en",
      contextHash: ctx.subjectHash,
      correlationId: ctx.correlationId,
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
    correlationId: ctx.correlationId,
  });
}

