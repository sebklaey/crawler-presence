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
 * Returns an upgrade payload when the caller may not run this tool, or null
 * when the call is allowed. Already-entitled callers never see a message.
 */
export async function checkToolAccess(input: {
  tool: string;
  roomToken?: string | null;
  language?: "de" | "en";
  feature?: string;
}): Promise<UpgradePayload | null> {
  const required = requiredPlanForTool(input.tool);
  if (required === "free") return null;

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
