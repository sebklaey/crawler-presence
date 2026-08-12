/**
 * Plan entitlements — the single place that turns a subscription into what a
 * published Presence may actually do.
 *
 * Decisions this encodes:
 *  - Paid checkout puts the Presence live immediately.
 *  - A canceled or past-due subscription keeps the Presence online, but locks
 *    analytics and editing (read-only, restricted).
 *  - Plan changes take effect immediately (the provider prorates the money).
 *  - After a downgrade, content records above the new limit stay stored but
 *    are hidden from the public files.
 */
import { planById, PLANS, type PlanId } from "./billing";
import type { KnowledgeCore } from "./knowledge";

export const isPlanId = (value: unknown): value is PlanId =>
  typeof value === "string" && PLANS.some((p) => p.id === value);

export const asPlanId = (value: unknown): PlanId => (isPlanId(value) ? value : "plus");

/** Human-readable price ids used in the subscription pricing registry. */
export const PRICE_EXTERNAL_IDS: Record<PlanId, string> = {
  plus: "crawler_plus_monthly",
  pro: "crawler_pro_monthly",
  business: "crawler_business_monthly",
};

/** Maps a payment-provider price back to a Crawler plan. */
export function planFromPriceExternalId(externalId: string | null | undefined): PlanId | null {
  if (!externalId) return null;
  const entry = (Object.keys(PRICE_EXTERNAL_IDS) as PlanId[]).find(
    (plan) => PRICE_EXTERNAL_IDS[plan] === externalId,
  );
  return entry ?? null;
}

/**
 * Restricted = still publicly online, but management features (analytics,
 * editing, republishing) are locked until billing is healthy again.
 */
export function isRestricted(subscriptionStatus: string | null | undefined, mode?: string): boolean {
  if (mode === "demo") return false;
  if (!subscriptionStatus) return false;
  return ["canceled", "past_due", "paused", "unpaid"].includes(subscriptionStatus);
}

export type CatalogLimitResult = { core: KnowledgeCore; hidden: number; limit: number };

/**
 * Applies the plan's digital content limit. Records beyond the limit are kept in the
 * stored Knowledge Core but never rendered into the public files, so an
 * upgrade brings them straight back.
 */
export function applyCatalogLimit(core: KnowledgeCore, plan: string): CatalogLimitResult {
  const limit = planById(asPlanId(plan)).catalogLimit;
  if (core.items.length <= limit) return { core, hidden: 0, limit };
  return {
    core: { ...core, items: core.items.slice(0, limit) },
    hidden: core.items.length - limit,
    limit,
  };
}
