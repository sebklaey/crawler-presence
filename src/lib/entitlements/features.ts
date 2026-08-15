/**
 * Projection of PLAN_DEFINITIONS (`./plans`) for feature-level checks.
 *
 * Every plan check — MCP tools, room library, API endpoints, UI — goes through
 * `hasEntitlement` / `canUseFeature`. Nothing compares plan strings directly,
 * because that breaks the hierarchy rule:
 *
 *   free (0) < plus (1) < pro (2) < business (3)
 *
 * A higher plan always contains every feature of every lower plan.
 * Unknown feature keys fail closed.
 */
import {
  FEATURE_PLAN_INDEX,
  PLAN_DEFINITIONS,
  PLAN_ORDER,
  isKnownFeature,
  limitsFor,
  resolveFeatureKey,
  type CustomerPlan,
} from "./plans";

export type { CustomerPlan };
export { limitsFor, isKnownFeature };

/** free = 0, plus = 1, pro = 2, business = 3. */
export const PLAN_RANK: Record<CustomerPlan, number> = {
  free: PLAN_DEFINITIONS.free.rank,
  plus: PLAN_DEFINITIONS.plus.rank,
  pro: PLAN_DEFINITIONS.pro.rank,
  business: PLAN_DEFINITIONS.business.rank,
};

/** Normalizes any legacy/DB/provider value onto the four canonical plan codes. */
export function normalizePlan(value: unknown): CustomerPlan {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (PLAN_ORDER.includes(raw as CustomerPlan)) return raw as CustomerPlan;
  if (["crawler_plus", "plus_monthly", "starter"].includes(raw)) return "plus";
  if (["crawler_pro", "pro_monthly", "premium"].includes(raw)) return "pro";
  if (["crawler_business", "business_monthly", "enterprise"].includes(raw)) return "business";
  return "free";
}

export const planRankOf = (value: unknown): number => PLAN_RANK[normalizePlan(value)];

/** True when `currentPlan` includes everything `requiredPlan` unlocks. */
export function hasEntitlement(currentPlan: unknown, requiredPlan: unknown): boolean {
  return planRankOf(currentPlan) >= planRankOf(requiredPlan);
}

/** Highest of several plan candidates (a plan is never downgraded silently). */
export function highestPlan(...candidates: unknown[]): CustomerPlan {
  return candidates.reduce<CustomerPlan>(
    (best, candidate) => (planRankOf(candidate) > planRankOf(best) ? normalizePlan(candidate) : best),
    "free",
  );
}

/** feature key → minimum plan, derived from PLAN_DEFINITIONS. */
export const FEATURE_MIN_PLAN: Record<string, CustomerPlan> = FEATURE_PLAN_INDEX;

/**
 * Minimum plan a feature needs. FAIL CLOSED: an unknown feature key is
 * treated as Business-only and logged as a configuration error.
 */
export function requiredPlanForFeature(featureKey: string): CustomerPlan {
  const key = resolveFeatureKey(featureKey);
  const mapped = FEATURE_MIN_PLAN[key];
  if (mapped) return mapped;
  console.error(`[entitlements] CONFIG ERROR: feature "${featureKey}" has no plan mapping — denying.`);
  return "business";
}

/** The one check every caller should use. */
export function canUseFeature(plan: unknown, featureKey: string): boolean {
  return hasEntitlement(plan, requiredPlanForFeature(featureKey));
}

/** Full feature map for a plan, with inheritance applied. */
export function featureMapFor(plan: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(FEATURE_MIN_PLAN)) out[key] = canUseFeature(plan, key);
  return out;
}

/**
 * Some tools serve several tiers depending on their arguments. This resolver
 * raises the tool-level requirement to the real feature requirement, so the
 * upgrade message always names the correct plan (community room = Pro).
 *
 * A community is its own container type — it never consumes or auto-creates a
 * Business Organization.
 */
export function requiredPlanForCall(tool: string, input: unknown): CustomerPlan | null {
  const data = (input ?? {}) as Record<string, unknown>;
  if (tool === "create_public_room") {
    const kind = String(data["kind"] ?? "").toLowerCase();
    if (kind === "organization" || data["organization_id"] || data["organization_name"]) {
      return requiredPlanForFeature("organizations");
    }
    return kind === "community"
      ? requiredPlanForFeature("communities")
      : requiredPlanForFeature("own_public_rooms");
  }
  return null;
}
