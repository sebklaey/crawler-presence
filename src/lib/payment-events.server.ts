/**
 * Idempotency and audit trail for payment webhooks.
 *
 * Paddle retries a delivery for up to three days, and the same event can also
 * arrive from a replay. Every event id is claimed exactly once here, so a
 * repeated delivery can never create a second subscription record or a second
 * publication. Nothing personal is stored — only ids, the event type and the
 * anonymous publish-intent reference.
 */
import { db } from "./mcp/db.server";

export type PaymentEventClaim = {
  claimed: boolean;
  /** false when the backend is unavailable — the caller must then fail loudly. */
  durable: boolean;
};

export async function claimPaymentEvent(input: {
  eventId: string;
  eventType: string;
  environment: "sandbox" | "live";
  intentRef?: string | null;
  subscriptionId?: string | null;
  occurredAt?: string | null;
}): Promise<PaymentEventClaim> {
  const supabase = db();
  if (!supabase) return { claimed: false, durable: false };

  const { error } = await supabase.from("payment_events").insert({
    event_id: input.eventId,
    event_type: input.eventType,
    environment: input.environment,
    intent_ref: input.intentRef ?? null,
    subscription_id: input.subscriptionId ?? null,
    occurred_at: input.occurredAt ?? null,
    status: "received",
  });

  // 23505 = unique violation → this event was already handled.
  if (error) {
    if (error.code === "23505") return { claimed: false, durable: true };
    console.error("[crawler] payment_events insert failed:", error.message);
    return { claimed: false, durable: false };
  }
  return { claimed: true, durable: true };
}

export async function finishPaymentEvent(eventId: string, error?: unknown): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  await supabase
    .from("payment_events")
    .update({
      status: error ? "failed" : "processed",
      processed_at: new Date().toISOString(),
      error: error ? String(error instanceof Error ? error.message : error).slice(0, 500) : null,
    })
    .eq("event_id", eventId);
}
