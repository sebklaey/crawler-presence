/**
 * Durable mirror of the payment provider's customer and subscription state.
 *
 * Crawler stays accountless: nothing here identifies a Crawler user, because
 * Crawler has none. These rows are a faithful copy of provider state, written
 * only by the verified webhook handler and readable only by server code
 * (RLS-locked, service-role client). They exist so fulfilment decisions do not
 * depend on a live API call.
 *
 * Writes are upserts keyed on the provider id, so an at-least-once or
 * out-of-order delivery can never create duplicates.
 */
import { evaluateSubscription } from "./billing/subscription-state";
import { PaymentProcessingError } from "./payment-events.server";
import { db } from "./mcp/db.server";

export type PaddleEnv = "sandbox" | "live";

const str = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

export type MirroredSubscription = {
  subscriptionId: string;
  customerId: string | null;
  status: string;
  priceId: string | null;
  productId: string | null;
  plan: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  scheduledChangeAction: string | null;
  scheduledChangeAt: string | null;
};

/**
 * Does this subscription currently grant paid access?
 *
 * Delegates to the single state machine in `./billing/subscription-state` —
 * an unrecognised status is NOT access and NOT Free, it is an unknown state
 * the caller must surface as temporarily unavailable.
 */
export function grantsAccess(subscription: {
  status?: string | null;
  currentPeriodEnd?: string | null;
} | null | undefined): boolean {
  return evaluateSubscription({
    status: subscription?.status,
    currentPeriodEnd: subscription?.currentPeriodEnd,
    treatMissingAsNone: true,
  }).grantsAccess;
}

export async function mirrorCustomer(
  customer: Record<string, any>,
  environment: PaddleEnv,
): Promise<void> {
  const customerId = str(customer["id"]);
  if (!customerId) return;
  const supabase = db();
  if (!supabase) return;

  const { error } = await supabase.from("billing_customers").upsert(
    {
      customer_id: customerId,
      email: str(customer["email"]),
      status: str(customer["status"]),
      environment,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "customer_id" },
  );
  if (error) throw new Error(`billing_customers upsert failed: ${error.message}`);
}

export function subscriptionFromEvent(subscription: Record<string, any>): MirroredSubscription | null {
  const subscriptionId = str(subscription["id"]);
  if (!subscriptionId) return null;
  const items = Array.isArray(subscription["items"]) ? (subscription["items"] as Record<string, any>[]) : [];
  const firstPrice = items[0]?.["price"] as Record<string, any> | undefined;

  return {
    subscriptionId,
    customerId: str(subscription["customer_id"]),
    status: str(subscription["status"]) ?? "unknown",
    priceId: str(firstPrice?.["id"]),
    productId: str(firstPrice?.["product_id"]) ?? str(items[0]?.["product"]?.id),
    plan: null,
    currentPeriodStart: str(subscription["current_billing_period"]?.starts_at),
    currentPeriodEnd: str(subscription["current_billing_period"]?.ends_at),
    scheduledChangeAction: str(subscription["scheduled_change"]?.action),
    scheduledChangeAt: str(subscription["scheduled_change"]?.effective_at),
  };
}

export type MirrorResult = {
  applied: boolean;
  stale: boolean;
  /** Set when the event was refused outright rather than merely superseded. */
  rejected?: "missing_occurred_at" | "equal_timestamp_conflict";
};

/** An event may only move subscription state when it can be ordered. */
export function isValidOccurredAt(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  return !Number.isNaN(new Date(value).getTime());
}

export async function mirrorSubscription(
  input: MirroredSubscription,
  environment: PaddleEnv,
  occurredAt?: string | null,
  eventId?: string | null,
): Promise<MirrorResult> {
  const supabase = db();
  // No database means we cannot record verified provider state. Throwing makes
  // the webhook fail so the provider retries — never a silent "not stale".
  if (!supabase) throw new PaymentProcessingError("db_unavailable");

  // Fail closed: an undated or unparseable event is never "the newest state".
  if (!isValidOccurredAt(occurredAt)) {
    return { applied: false, stale: false, rejected: "missing_occurred_at" };
  }

  // Monotonic ordering happens inside PostgreSQL: the conditional
  // INSERT … ON CONFLICT DO UPDATE WHERE only applies when the incoming event
  // is not older than the stored one, so two concurrent deliveries cannot
  // regress state between a SELECT and an UPSERT.
  const { data, error } = await supabase.rpc("mirror_subscription_monotonic", {
    p_subscription_id: input.subscriptionId,
    p_customer_id: input.customerId,
    p_status: input.status,
    p_price_id: input.priceId,
    p_product_id: input.productId,
    p_plan: input.plan,
    p_environment: environment,
    p_current_period_start: input.currentPeriodStart,
    p_current_period_end: input.currentPeriodEnd,
    p_scheduled_change_action: input.scheduledChangeAction,
    p_scheduled_change_at: input.scheduledChangeAt,
    p_canceled_at: input.status === "canceled" ? new Date().toISOString() : null,
    p_occurred_at: occurredAt,
    p_event_id: eventId ?? null,
  });

  if (error) throw new PaymentProcessingError("mirror_failed");
  const result = (data ?? {}) as { applied?: boolean; stale?: boolean; rejected?: string };
  if (result.rejected === "equal_timestamp_conflict") {
    return { applied: false, stale: false, rejected: "equal_timestamp_conflict" };
  }
  if (result.rejected === "missing_occurred_at") {
    return { applied: false, stale: false, rejected: "missing_occurred_at" };
  }
  const applied = Boolean(result.applied);
  return { applied, stale: !applied };
}

/** Server-side lookup used by the accountless management portal. */
export async function getMirroredSubscription(
  subscriptionId: string,
): Promise<(MirroredSubscription & { environment: string }) | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select("*")
    .eq("subscription_id", subscriptionId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, any>;
  return {
    subscriptionId: row["subscription_id"],
    customerId: row["customer_id"],
    status: row["status"],
    priceId: row["price_id"],
    productId: row["product_id"],
    plan: row["plan"],
    currentPeriodStart: row["current_period_start"],
    currentPeriodEnd: row["current_period_end"],
    scheduledChangeAction: row["scheduled_change_action"],
    scheduledChangeAt: row["scheduled_change_at"],
    environment: row["environment"],
  };
}
