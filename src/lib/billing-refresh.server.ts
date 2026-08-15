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

const PLAN_RANK: Record<string, number> = { plus: 1, pro: 2, business: 3 };
const ACTIVE = new Set(["active", "trialing", "past_due"]);

/**
 * Reconciles one Presence with everything its customer currently pays for.
 *
 * An upgrade bought through a fresh checkout produces a *new* subscription, so
 * looking only at the subscription the Presence was published with keeps
 * showing the old plan. This picks the highest active subscription of the same
 * customer, attaches it to the Presence and writes the plan back immediately.
 */
export async function reconcilePresenceBilling(input: {
  slug: string;
  customerId: string | null | undefined;
  subscriptionId: string | null | undefined;
}): Promise<RefreshedBilling> {
  if (!input.customerId) return refreshSubscriptionPlan(input.subscriptionId);

  const throttleKey = `customer:${input.customerId}`;
  const previous = lastRun.get(throttleKey) ?? 0;
  if (Date.now() - previous < THROTTLE_MS) return null;
  lastRun.set(throttleKey, Date.now());

  try {
    const { paymentsReady } = await import("./payments-config");
    if (!paymentsReady()) return null;

    const { listCustomerSubscriptions, planOfSubscription } = await import("./paddle.server");
    const subscriptions = await listCustomerSubscriptions(input.customerId);

    let best: { id: string; plan: string; status: string; endsAt: string | null; rank: number } | null = null;
    for (const subscription of subscriptions) {
      const status = subscription.status ?? "";
      if (!ACTIVE.has(status)) continue;
      const plan = await planOfSubscription(subscription);
      if (!plan) continue;
      const rank = PLAN_RANK[plan] ?? 0;
      const endsAt = subscription.current_billing_period?.ends_at ?? null;
      if (!best || rank > best.rank || (rank === best.rank && (endsAt ?? "") > (best.endsAt ?? ""))) {
        best = { id: subscription.id, plan, status, endsAt, rank };
      }
    }
    if (!best) return refreshSubscriptionPlan(input.subscriptionId);

    const { attachPresenceSubscription, syncPresenceBilling } = await import("./mcp/presences");
    if (best.id !== input.subscriptionId) await attachPresenceSubscription(input.slug, best.id);
    await syncPresenceBilling(best.id, {
      subscriptionStatus: best.status,
      currentPeriodEnd: best.endsAt,
      plan: best.plan,
    });

    return { plan: best.plan, subscriptionStatus: best.status, currentPeriodEnd: best.endsAt };
  } catch (error) {
    console.error("[crawler] billing reconcile failed:", error);
    return refreshSubscriptionPlan(input.subscriptionId);
  }
}

