/**
 * Projection of PLAN_DEFINITIONS (`./plans`) for tool-level checks.
 *
 * This file declares NO plan data of its own — it only re-shapes the single
 * source of truth. Unknown tools fail closed.
 */
import {
  ADMIN_TOOLS,
  PLAN_DEFINITIONS,
  PLAN_ORDER as ORDER,
  TOOL_PLAN_INDEX,
  isKnownTool,
  type CustomerPlan,
  type EntitlementPlan,
} from "./plans";

export type { CustomerPlan, EntitlementPlan };
export { isKnownTool, ADMIN_TOOLS };

/** free < plus < pro < business. `admin` is separate and never purchasable. */
export const PLAN_ORDER: CustomerPlan[] = ORDER;

export const planRank = (plan: string): number => {
  const index = PLAN_ORDER.indexOf(plan as CustomerPlan);
  return index < 0 ? 0 : index;
};

export const meetsPlan = (current: string, required: CustomerPlan): boolean =>
  planRank(current) >= planRank(required);

export type PlanInfo = {
  id: EntitlementPlan;
  name: string;
  /** USD per month. 0 for free, null for admin (not purchasable). */
  price: number | null;
  headline: string;
  benefits: string[];
};

export const PLAN_INFO: Record<EntitlementPlan, PlanInfo> = {
  free: PLAN_DEFINITIONS.free,
  plus: PLAN_DEFINITIONS.plus,
  pro: PLAN_DEFINITIONS.pro,
  business: PLAN_DEFINITIONS.business,
  admin: {
    id: "admin" as EntitlementPlan,
    name: "Platform admin",
    price: null,
    headline: "Internal Crawler platform administration.",
    benefits: [],
  },
};

/** tool → minimum plan. Exactly one entry per tool, derived from PLAN_DEFINITIONS. */
export const TOOL_PLANS: Record<string, EntitlementPlan> = TOOL_PLAN_INDEX;

/** Tools that stay callable on every plan but return plan-dependent depth. */
export const PLAN_DEPENDENT_TOOLS = [
  "get_analytics",
  "import_document",
  "create_image_upload",
  "post_social_profile_to_room",
  "create_public_room",
  "publish_presence",
] as const;

/**
 * Minimum plan for a tool. FAIL CLOSED: an unknown tool is treated as
 * admin-only and logged as a configuration error, so a tool that was added
 * without an entitlement mapping can never ship as silently free.
 */
export function requiredPlanForTool(tool: string): EntitlementPlan {
  const mapped = TOOL_PLANS[tool];
  if (mapped) return mapped;
  console.error(`[entitlements] CONFIG ERROR: tool "${tool}" has no plan mapping — denying.`);
  return "admin";
}

/** Cheapest customer plan that unlocks a tool, or null for admin-only tools. */
export function upgradeTargetForTool(tool: string): CustomerPlan | null {
  const required = requiredPlanForTool(tool);
  return required === "admin" ? null : required;
}
