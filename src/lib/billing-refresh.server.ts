/**
 * Pull-based plan reconciliation.
 *
 * A webhook is the source of truth, but it can arrive seconds late. Whenever a
 * user looks at their plan — in /manage or through an MCP tool — Crawler asks
 * the payment provider directly for the current subscription state and stores
 * it, so an upgrade is visible immediately instead of "after the next event".
 *
 * Calls are throttled per subscription so a burst of tool calls never turns
 * into a burst of provider requests.
 */

const THROTTLE_MS = 15_000;
const lastRun = new Map<string, number>();

export type RefreshedBilling = {
  plan: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
} | null;

/**
 * Reads the live subscription and writes plan/status back onto every Presence
 * that belongs to it. Returns the fresh values, or null when nothing could be
 * refreshed (no provider configured, throttled, or provider unreachable).
 */
export async function refreshSubscriptionPlan(
  subscriptionId: string | null | undefined,
): Promise<RefreshedBilling> {
  if (!subscriptionId) return null;

  const previous = lastRun.get(subscriptionId) ?? 0;
  if (Date.now() - previous < THROTTLE_MS) return null;
  lastRun.set(subscriptionId, Date.now());

  try {
    const { paymentsReady } = await import("./payments-config");
    if (!paymentsReady()) return null;

    const { fetchSubscription, planOfSubscription } = await import("./paddle.server");
    const subscription = await fetchSubscription(subscriptionId);
    const status = subscription.status ?? null;
    const plan = status === "canceled" ? null : await planOfSubscription(subscription);
    const currentPeriodEnd = subscription.current_billing_period?.ends_at ?? null;

    const { syncPresenceBilling } = await import("./mcp/presences");
    await syncPresenceBilling(subscriptionId, {
      subscriptionStatus: status,
      currentPeriodEnd,
      plan,
    });

    return { plan, subscriptionStatus: status, currentPeriodEnd };
  } catch (error) {
    console.error("[crawler] plan refresh failed:", error);
    return null;
  }
}
