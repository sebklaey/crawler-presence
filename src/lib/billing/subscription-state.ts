/**
 * The single, server-authoritative subscription state machine.
 *
 * Every surface that has to answer "does this subscription grant paid access
 * right now?" derives that answer here — the webhook, the access resolver, the
 * mirror and the management portal. The mapping is a positive allowlist: a
 * status we do not know about is NEVER silently treated as Free, because a
 * paying customer must not be asked to buy again over an unrecognised string.
 */

export type SubscriptionState =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled"
  | "expired"
  | "unknown";

/** Deliberate handling of every status the provider can send. */
const STATE_BY_STATUS: Record<string, SubscriptionState> = {
  active: "active",
  trialing: "trialing",
  trial: "trialing",
  past_due: "past_due",
  // Paddle's `unpaid` is dunning that has run out of retries; treated like an
  // ended subscription with a possible paid remainder.
  unpaid: "expired",
  paused: "paused",
  canceled: "canceled",
  cancelled: "canceled",
  expired: "expired",
  deleted: "expired",
};

/** States that grant access outright, regardless of the period end. */
const GRANTING: ReadonlySet<SubscriptionState> = new Set(["active", "trialing", "past_due"]);

/** States that keep access only until the already-paid period runs out. */
const GRACE: ReadonlySet<SubscriptionState> = new Set(["canceled", "expired"]);

export type SubscriptionDecision = {
  state: SubscriptionState;
  /** "granted" | "denied" — "unknown" means: do not decide, report an outage. */
  decision: "granted" | "denied" | "unknown";
  grantsAccess: boolean;
  /** true when the caller must surface current_plan_unknown / service_unavailable. */
  unknown: boolean;
};

export function classifySubscriptionStatus(status: unknown): SubscriptionState {
  if (status === null || status === undefined || status === "") return "unknown";
  const key = String(status).trim().toLowerCase();
  return STATE_BY_STATUS[key] ?? "unknown";
}

export function evaluateSubscription(input: {
  status?: unknown;
  currentPeriodEnd?: unknown;
  /** A missing status on a record that never had a subscription is simply "no subscription". */
  treatMissingAsNone?: boolean;
  now?: number;
}): SubscriptionDecision {
  const raw = input.status;
  const missing = raw === null || raw === undefined || raw === "";
  if (missing && input.treatMissingAsNone) {
    return { state: "expired", decision: "denied", grantsAccess: false, unknown: false };
  }

  const state = classifySubscriptionStatus(raw);
  if (state === "unknown") {
    return { state, decision: "unknown", grantsAccess: false, unknown: true };
  }

  if (GRANTING.has(state)) {
    return { state, decision: "granted", grantsAccess: true, unknown: false };
  }

  if (GRACE.has(state)) {
    const now = input.now ?? Date.now();
    const end = input.currentPeriodEnd ? new Date(String(input.currentPeriodEnd)).getTime() : 0;
    const within = Boolean(end && end >= now);
    return {
      state,
      decision: within ? "granted" : "denied",
      grantsAccess: within,
      unknown: false,
    };
  }

  // paused
  return { state, decision: "denied", grantsAccess: false, unknown: false };
}

/**
 * Monotonic ordering: an event that happened before the state we already
 * stored must never overwrite it (Paddle can redeliver out of order).
 */
export function isStaleEvent(
  storedOccurredAt: string | null | undefined,
  incomingOccurredAt: string | null | undefined,
): boolean {
  if (!storedOccurredAt || !incomingOccurredAt) return false;
  const stored = new Date(storedOccurredAt).getTime();
  const incoming = new Date(incomingOccurredAt).getTime();
  if (Number.isNaN(stored) || Number.isNaN(incoming)) return false;
  return incoming < stored;
}
