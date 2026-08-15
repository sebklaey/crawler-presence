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
  /**
   * Fencing token for THIS attempt. Only the worker holding the current token
   * may finalize the event: a worker whose lease expired and was reclaimed by
   * someone else can no longer overwrite the new owner's result.
   */
  claimToken: string | null;
};

export type FinishResult = {
  applied: boolean;
  /** "lease_lost" means another worker owns the event now — never silently ack. */
  reason: "applied" | "lease_lost" | "missing_claim_token" | "unavailable";
};

/**
 * The ONLY strings that may ever be persisted as `error_code`. Nothing is
 * derived from a provider or exception message: a message can contain an API
 * key, a bearer token, a capability, an email address or a URL, and this audit
 * row is long-lived. Unmapped failures collapse to "handler_error".
 */
export const PAYMENT_ERROR_CODES = [
  "handler_error",
  "db_unavailable",
  "mirror_failed",
  "mirror_conflict",
  "fulfillment_failed",
  "presence_sync_failed",
  "intent_update_failed",
  "provider_unavailable",
  "unknown_error",
] as const;

export type PaymentErrorCode = (typeof PAYMENT_ERROR_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(PAYMENT_ERROR_CODES);

/** A failure carrying a controlled, allowlisted code (never free text). */
export class PaymentProcessingError extends Error {
  readonly code: PaymentErrorCode;
  constructor(code: PaymentErrorCode, message?: string) {
    // The message stays in-process for local debugging only; it is never
    // persisted and never logged by this module.
    super(message ?? code);
    this.name = "PaymentProcessingError";
    this.code = CODE_SET.has(code) ? code : "handler_error";
  }
}

export const MAX_PAYMENT_EVENT_ATTEMPTS = 5;
const LEASE_SECONDS = 300;

/**
 * Map any thrown value onto the allowlist above. This function reads NOTHING
 * from `error.message`, so no key, token, capability, email or URL contained in
 * a provider error can reach the database or the logs.
 */
export function sanitizeErrorCode(error: unknown): PaymentErrorCode {
  if (!error) return "unknown_error";
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && CODE_SET.has(code)) return code as PaymentErrorCode;
  return "handler_error";
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
  if (!supabase)
    return { outcome: "retry_later", claimed: false, durable: false, attempts: 0, claimToken: null };

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
    return { outcome: "retry_later", claimed: false, durable: false, attempts: 0, claimToken: null };
  }

  const result = (data ?? {}) as { outcome?: string; attempts?: number; claim_token?: string };
  const outcome = (result.outcome ?? "retry_later") as ClaimOutcome;
  return {
    outcome,
    claimed: outcome === "claimed" || outcome === "reclaimed",
    durable: outcome !== "retry_later",
    attempts: result.attempts ?? 0,
    claimToken: result.claim_token ?? null,
  };
}

/**
 * Finalize the attempt identified by `claimToken`. The SQL side matches on
 * event_id + claim_token + status='processing', so a late worker whose lease was
 * reclaimed changes nothing and gets `lease_lost` back. Callers must surface
 * that as an observable conflict instead of acknowledging the delivery.
 */
export async function finishPaymentEvent(
  eventId: string,
  claimToken: string | null,
  error?: unknown,
  correlationId?: string | null,
): Promise<FinishResult> {
  const supabase = db();
  if (!supabase) return { applied: false, reason: "unavailable" };
  if (!claimToken) return { applied: false, reason: "missing_claim_token" };

  const { data, error: rpcError } = await supabase.rpc("finish_payment_event", {
    p_event_id: eventId,
    p_claim_token: claimToken,
    p_error_code: error ? sanitizeErrorCode(error) : null,
    p_correlation_id: correlationId ?? null,
  });
  if (rpcError) {
    console.error("[crawler] finish_payment_event failed:", rpcError.code ?? "rpc_error");
    return { applied: false, reason: "unavailable" };
  }
  const result = (data ?? {}) as { applied?: boolean; reason?: string };
  if (result.applied) return { applied: true, reason: "applied" };
  return {
    applied: false,
    reason: result.reason === "missing_claim_token" ? "missing_claim_token" : "lease_lost",
  };
}
