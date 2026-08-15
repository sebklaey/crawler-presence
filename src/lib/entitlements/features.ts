/**
 * THE central entitlement source of truth for Crawler.
 *
 * Every plan check — MCP tools, room library, API endpoints, UI — must go
 * through `hasEntitlement` / `canUseFeature` from this file. Nothing may
 * compare plan strings directly (`plan === "plus"`), because that breaks the
 * hierarchy rule:
 *
 *   free (0) < plus (1) < pro (2) < business (3)
 *
 * A higher plan always contains every feature of every lower plan.
 */
import { PLAN_ORDER, type CustomerPlan } from "./catalog";

export type { CustomerPlan };

/** free = 0, plus = 1, pro = 2, business = 3. */
export const PLAN_RANK: Record<CustomerPlan, number> = {
  free: 0,
  plus: 1,
  pro: 2,
  business: 3,
};

/** Normalizes any legacy/DB/user value onto the four canonical plan codes. */
export function normalizePlan(value: unknown): CustomerPlan {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (PLAN_ORDER.includes(raw as CustomerPlan)) return raw as CustomerPlan;
  // Historic aliases seen in older rows / provider payloads.
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

/**
 * Feature key → minimum plan. Keys are the internal entitlement keys used
 * across the room library. Anything not listed here is free.
 */
export const FEATURE_MIN_PLAN: Record<string, CustomerPlan> = {
  /* ------------------------------- plus -------------------------------- */
  personal_room: "plus",
  // historic key for "own public rooms"
  private_rooms: "plus",
  own_public_rooms: "plus",
  invitations: "plus",
  custom_alias: "plus",
  delete_own: "plus",
  favorites: "plus",
  pin: "plus",
  ad_free_owned: "plus",
  profile_analytics: "plus",

  /* -------------------------------- pro -------------------------------- */
  communities: "pro",
  moderators: "pro",
  match: "pro",
  pair_rooms: "pro",
  love: "pro",
  polls: "pro",
  events: "pro",
  search: "pro",
  summaries: "pro",
  analytics: "pro",
  room_analytics: "pro",
  paid_rooms: "pro",
  custom_domain: "pro",

  /* ----------------------------- business ------------------------------ */
  organizations: "business",
  campaigns: "business",
  sponsored_campaigns: "business",
  api_access: "business",
  export: "business",
  exports: "business",
  audit_logs: "business",
  branding: "business",
  translation: "business",
  sso: "business",
};

/** Minimum plan a feature needs; unknown features are free. */
export function requiredPlanForFeature(featureKey: string): CustomerPlan {
  return FEATURE_MIN_PLAN[featureKey] ?? "free";
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
 */
export function requiredPlanForCall(tool: string, input: unknown): CustomerPlan | null {
  const data = (input ?? {}) as Record<string, unknown>;
  if (tool === "create_public_room") {
    const kind = String(data["kind"] ?? "").toLowerCase();
    const wantsCommunity = kind === "community" || Boolean(data["organization_id"] || data["organization_name"]);
    return wantsCommunity ? requiredPlanForFeature("communities") : requiredPlanForFeature("private_rooms");
  }
  return null;
}
