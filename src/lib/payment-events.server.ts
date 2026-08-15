/**
 * Idempotency, retry and audit trail for payment webhooks.
 *
 * Paddle retries a delivery for up to three days, and the same event can also
 * arrive from a replay. Claiming is a state machine, executed atomically inside
 * PostgreSQL (`claim_payment_event`), never as select-then-update here:
 *
 *   processed              → duplicate, successful no-op
 *   received/processing    → another worker holds a fresh lease: no-op
 *   failed / expired lease → atomically reclaimed and retried
 *   attempts exhausted     → terminal, recorded in the audit row
 *
 * Nothing personal and no raw provider error text is stored — only ids, the
 * event type, the anonymous publish-intent reference, a short sanitized error
 * code and a correlation id.
 */
import { db } from "./mcp/db.server";

export type ClaimOutcome =
  | "claimed"
  | "reclaimed"
  | "processed"
  | "in_progress"
  | "exhausted"
  | "retry_later";

export type PaymentEventClaim = {
  outcome: ClaimOutcome;
  /** true when this caller must now process the event. */
  claimed: boolean;
  /** false when the backend is unavailable — the caller must then fail loudly. */
  durable: boolean;
  attempts: number;
};

export const MAX_PAYMENT_EVENT_ATTEMPTS = 5;
const LEASE_SECONDS = 300;

/**
 * Reduce any thrown value to a short, secret-free code. Provider errors can
 * quote request bodies or keys, so the message itself is never persisted.
 */
export function sanitizeErrorCode(error: unknown): string {
  if (!error) return "unknown_error";
  const name = error instanceof Error ? error.name : typeof error;
  const raw = error instanceof Error ? error.message : String(error);
  const token = raw.match(/[a-z][a-z0-9_]{2,40}/i)?.[0] ?? "error";
  return `${name}:${token}`.toLowerCase().replace(/[^a-z0-9_:]/g, "").slice(0, 64);
}

export async function claimPaymentEvent(input: {
  eventId: string;
  eventType: string;
  environment: "sandbox" | "live";
  intentRef?: string | null;
  subscriptionId?: string | null;
  occurredAt?: string | null;
  correlationId?: string | null;
}): Promise<PaymentEventClaim> {
  const supabase = db();
  if (!supabase) return { outcome: "retry_later", claimed: false, durable: false, attempts: 0 };

  const { data, error } = await supabase.rpc("claim_payment_event", {
    p_event_id: input.eventId,
    p_event_type: input.eventType,
    p_environment: input.environment,
    p_intent_ref: input.intentRef ?? null,
    p_subscription_id: input.subscriptionId ?? null,
    p_occurred_at: input.occurredAt ?? null,
    p_correlation_id: input.correlationId ?? null,
    p_lease_seconds: LEASE_SECONDS,
    p_max_attempts: MAX_PAYMENT_EVENT_ATTEMPTS,
  });

  if (error) {
    console.error("[crawler] claim_payment_event failed:", error.code ?? "rpc_error");
    return { outcome: "retry_later", claimed: false, durable: false, attempts: 0 };
  }

  const result = (data ?? {}) as { outcome?: string; attempts?: number };
  const outcome = (result.outcome ?? "retry_later") as ClaimOutcome;
  return {
    outcome,
    claimed: outcome === "claimed" || outcome === "reclaimed",
    durable: outcome !== "retry_later",
    attempts: result.attempts ?? 0,
  };
}

export async function finishPaymentEvent(
  eventId: string,
  error?: unknown,
  correlationId?: string | null,
): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  const { error: rpcError } = await supabase.rpc("finish_payment_event", {
    p_event_id: eventId,
    p_error_code: error ? sanitizeErrorCode(error) : null,
    p_correlation_id: correlationId ?? null,
  });
  if (rpcError) console.error("[crawler] finish_payment_event failed:", rpcError.code ?? "rpc_error");
}
