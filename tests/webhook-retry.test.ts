/**
 * Webhook retry claim machine, lease fencing, monotonic ordering and error-code
 * sanitization. Run: bun test tests/webhook-retry.test.ts
 *
 * The PostgreSQL routines are emulated faithfully (row locking, lease expiry,
 * fencing token, attempt budget, fail-closed ordering with an event-id
 * tie-breaker) so the client wrappers meet the same semantics the migration
 * installs. No real secret or capability appears here — only secret-SHAPED
 * fixtures used to prove they cannot be persisted.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { evaluateSubscription } from "../src/lib/billing/subscription-state";

// ------------------------------------------------------------ fake database

type EventRow = {
  event_id: string;
  status: string;
  attempts: number;
  lease_expires_at: number | null;
  claim_token: string | null;
  error_code: string | null;
};

const MAX_ATTEMPTS = 5;
const LEASE_MS = 300_000;

let events: Map<string, EventRow>;
let subs: Map<string, { status: string; plan: string; last: number | null; eventId: string | null }>;
let now: number;
let dbUp: boolean;
let tokenSeq = 0;

function claimRpc(p: Record<string, any>) {
  const id = p["p_event_id"] as string;
  const token = `tok_${(tokenSeq += 1)}`;
  const row = events.get(id);
  if (!row) {
    events.set(id, {
      event_id: id,
      status: "processing",
      attempts: 1,
      lease_expires_at: now + LEASE_MS,
      claim_token: token,
      error_code: null,
    });
    return { outcome: "claimed", attempts: 1, claim_token: token };
  }
  if (row.status === "processed") return { outcome: "processed", attempts: row.attempts };
  if (row.status === "exhausted") return { outcome: "exhausted", attempts: row.attempts };
  if (
    (row.status === "received" || row.status === "processing") &&
    row.lease_expires_at !== null &&
    row.lease_expires_at > now
  ) {
    return { outcome: "in_progress", attempts: row.attempts };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    row.status = "exhausted";
    row.lease_expires_at = null;
    row.claim_token = null;
    return { outcome: "exhausted", attempts: row.attempts };
  }
  row.status = "processing";
  row.attempts += 1;
  row.lease_expires_at = now + LEASE_MS;
  row.claim_token = token;
  row.error_code = null;
  return { outcome: "reclaimed", attempts: row.attempts, claim_token: token };
}

function finishRpc(p: Record<string, any>) {
  const token = p["p_claim_token"] as string | null;
  if (!token) return { applied: false, reason: "missing_claim_token" };
  const row = events.get(p["p_event_id"] as string);
  // Fencing: event_id + current claim token + processing status must all match.
  if (!row || row.claim_token !== token || row.status !== "processing") {
    return { applied: false, reason: "lease_lost" };
  }
  row.status = p["p_error_code"] ? "failed" : "processed";
  row.lease_expires_at = null;
  row.claim_token = null;
  row.error_code = (p["p_error_code"] as string | null) ?? null;
  return { applied: true, status: row.status, attempts: row.attempts };
}

function mirrorRpc(p: Record<string, any>) {
  const id = p["p_subscription_id"] as string;
  const rawTs = p["p_occurred_at"] as string | null;
  if (!rawTs) return { applied: false, stale: false, rejected: "missing_occurred_at" };
  const incoming = new Date(rawTs).getTime();
  const eventId = (p["p_event_id"] as string | null) ?? null;
  const existing = subs.get(id);
  if (existing && existing.last !== null) {
    if (incoming < existing.last) return { applied: false, stale: true };
    if (incoming === existing.last) {
      if (eventId && existing.eventId && eventId === existing.eventId) {
        return { applied: true, stale: false, idempotent: true };
      }
      return { applied: false, stale: false, rejected: "equal_timestamp_conflict" };
    }
  }
  subs.set(id, { status: p["p_status"] as string, plan: p["p_plan"] as string, last: incoming, eventId });
  return { applied: true, stale: false };
}

const fakeDb = () =>
  dbUp
    ? {
        rpc: async (name: string, params: Record<string, any>) => {
          if (name === "claim_payment_event") return { data: claimRpc(params), error: null };
          if (name === "finish_payment_event") return { data: finishRpc(params), error: null };
          if (name === "mirror_subscription_monotonic") return { data: mirrorRpc(params), error: null };
          return { data: null, error: { code: "unknown_rpc" } };
        },
      }
    : null;

mock.module("../src/lib/mcp/db.server", () => ({ db: fakeDb }));

const {
  claimPaymentEvent,
  finishPaymentEvent,
  sanitizeErrorCode,
  PaymentProcessingError,
  PAYMENT_ERROR_CODES,
} = await import("../src/lib/payment-events.server");
const { mirrorSubscription, isValidOccurredAt } = await import("../src/lib/billing-mirror.server");

const claim = (eventId: string) =>
  claimPaymentEvent({ eventId, eventType: "subscription.updated", environment: "sandbox" });

beforeEach(() => {
  events = new Map();
  subs = new Map();
  now = Date.UTC(2026, 0, 1);
  dbUp = true;
});

// ------------------------------------------------------------ claim machine

describe("payment event claim machine", () => {
  test("first delivery is claimed, a successfully processed replay is a no-op", async () => {
    const first = await claim("evt_1");
    expect(first.claimed).toBe(true);
    expect(first.claimToken).toBeTruthy();
    await finishPaymentEvent("evt_1", first.claimToken);

    const replay = await claim("evt_1");
    expect(replay.claimed).toBe(false);
    expect(replay.outcome).toBe("processed");
  });

  test("a FAILED event is retried, not permanently lost", async () => {
    const a = await claim("evt_2");
    await finishPaymentEvent("evt_2", a.claimToken, new PaymentProcessingError("mirror_failed"));

    const retry = await claim("evt_2");
    expect(retry.claimed).toBe(true);
    expect(retry.outcome).toBe("reclaimed");
    expect(retry.attempts).toBe(2);
  });

  test("a concurrent worker holding a fresh lease is skipped", async () => {
    const [a, b] = await Promise.all([claim("evt_3"), claim("evt_3")]);
    expect([a.claimed, b.claimed].filter(Boolean)).toHaveLength(1);
    expect((a.claimed ? b : a).outcome).toBe("in_progress");
  });

  test("an abandoned attempt (crashed worker, expired lease) is reclaimed", async () => {
    await claim("evt_4");
    expect((await claim("evt_4")).outcome).toBe("in_progress");
    now += LEASE_MS + 1_000;
    expect((await claim("evt_4")).outcome).toBe("reclaimed");
  });

  test("the attempt budget is bounded and ends in a terminal exhausted state", async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      const c = await claim("evt_5");
      expect(c.claimed).toBe(true);
      await finishPaymentEvent("evt_5", c.claimToken, new PaymentProcessingError("handler_error"));
    }
    expect((await claim("evt_5")).outcome).toBe("exhausted");
  });

  test("an unavailable backend is non-durable so the provider retries", async () => {
    dbUp = false;
    const c = await claim("evt_6");
    expect(c.durable).toBe(false);
    expect(c.claimed).toBe(false);
  });
});

// ------------------------------------------------------------ lease fencing

describe("lease owner fencing", () => {
  test("worker A loses its lease, B reclaims, late A cannot finalize B's event", async () => {
    const a = await claim("evt_f1");
    now += LEASE_MS + 1_000; // A's lease expires
    const b = await claim("evt_f1");
    expect(b.claimed).toBe(true);
    expect(b.claimToken).not.toBe(a.claimToken);

    const lateA = await finishPaymentEvent("evt_f1", a.claimToken);
    expect(lateA.applied).toBe(false);
    expect(lateA.reason).toBe("lease_lost");
    // The row is untouched: B still owns a live processing attempt.
    expect(events.get("evt_f1")!.status).toBe("processing");
    expect(events.get("evt_f1")!.claim_token).toBe(b.claimToken);

    const okB = await finishPaymentEvent("evt_f1", b.claimToken);
    expect(okB.applied).toBe(true);
    expect(events.get("evt_f1")!.status).toBe("processed");
  });

  test("a late A FAILURE cannot overwrite B's processed status", async () => {
    const a = await claim("evt_f2");
    now += LEASE_MS + 1_000;
    const b = await claim("evt_f2");
    await finishPaymentEvent("evt_f2", b.claimToken);

    const lateFailure = await finishPaymentEvent(
      "evt_f2",
      a.claimToken,
      new PaymentProcessingError("handler_error"),
    );
    expect(lateFailure.applied).toBe(false);
    expect(events.get("evt_f2")!.status).toBe("processed");
    expect(events.get("evt_f2")!.error_code).toBeNull();
  });

  test("finalizing without a token is refused and changes nothing", async () => {
    await claim("evt_f3");
    const r = await finishPaymentEvent("evt_f3", null);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("missing_claim_token");
    expect(events.get("evt_f3")!.status).toBe("processing");
  });

  test("a finalize during an outage is reported, never silently applied", async () => {
    const a = await claim("evt_f4");
    dbUp = false;
    const r = await finishPaymentEvent("evt_f4", a.claimToken);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("unavailable");
  });
});

// ------------------------------------------------------------ ordering

const sub = (status: string, plan = "pro") =>
  ({
    subscriptionId: "sub_1",
    customerId: "ctm_1",
    status,
    priceId: "pri_1",
    productId: "pro_1",
    plan,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    scheduledChangeAction: null,
    scheduledChangeAt: null,
  }) as any;

const T1 = "2026-01-01T00:00:00.000Z";
const T2 = "2026-02-01T00:00:00.000Z";

describe("subscription event ordering is fail-closed", () => {
  test("a missing timestamp is rejected and never becomes state", async () => {
    const r = await mirrorSubscription(sub("active"), "sandbox", null, "evt_a");
    expect(r.applied).toBe(false);
    expect(r.rejected).toBe("missing_occurred_at");
    expect(subs.size).toBe(0);
  });

  test("an invalid timestamp is rejected, including on first insert", async () => {
    for (const bad of ["", "   ", "not-a-date", "2026-13-45T99:99:99Z"]) {
      expect(isValidOccurredAt(bad)).toBe(false);
      const r = await mirrorSubscription(sub("active"), "sandbox", bad, "evt_b");
      expect(r.applied).toBe(false);
      expect(r.rejected).toBe("missing_occurred_at");
    }
    expect(subs.size).toBe(0);
  });

  test("an undated event cannot overwrite dated state", async () => {
    await mirrorSubscription(sub("canceled"), "sandbox", T2, "evt_new");
    const r = await mirrorSubscription(sub("active"), "sandbox", null, "evt_undated");
    expect(r.applied).toBe(false);
    expect(subs.get("sub_1")!.status).toBe("canceled");
  });

  test("a newer event wins, an older one is stale", async () => {
    expect((await mirrorSubscription(sub("active"), "sandbox", T1, "e1")).applied).toBe(true);
    expect((await mirrorSubscription(sub("canceled"), "sandbox", T2, "e2")).applied).toBe(true);
    const late = await mirrorSubscription(sub("active"), "sandbox", T1, "e1_replay");
    expect(late.stale).toBe(true);
    expect(subs.get("sub_1")!.status).toBe("canceled");
  });

  test("an identical redelivery at the same timestamp is idempotent", async () => {
    await mirrorSubscription(sub("active"), "sandbox", T2, "e_same");
    const again = await mirrorSubscription(sub("active"), "sandbox", T2, "e_same");
    expect(again.applied).toBe(true);
    expect(again.rejected).toBeUndefined();
    expect(subs.get("sub_1")!.status).toBe("active");
  });

  test("a DIFFERENT event at the same timestamp is rejected, not last-writer-wins", async () => {
    await mirrorSubscription(sub("active"), "sandbox", T2, "e_first");
    const conflict = await mirrorSubscription(sub("canceled"), "sandbox", T2, "e_other");
    expect(conflict.applied).toBe(false);
    expect(conflict.rejected).toBe("equal_timestamp_conflict");
    expect(subs.get("sub_1")!.status).toBe("active");
  });

  test("concurrent deliveries settle on the newest event in both orders", async () => {
    for (const order of [0, 1]) {
      subs = new Map();
      const calls = [
        () => mirrorSubscription(sub("active"), "sandbox", T1, "c1"),
        () => mirrorSubscription(sub("canceled"), "sandbox", T2, "c2"),
      ];
      if (order === 1) calls.reverse();
      await Promise.all(calls.map((c) => c()));
      expect(subs.get("sub_1")!.status).toBe("canceled");
    }
  });

  test("a missing database throws so the webhook fails and Paddle retries", async () => {
    dbUp = false;
    await expect(mirrorSubscription(sub("active"), "sandbox", T2, "e")).rejects.toThrow();
  });
});

// ------------------------------------------------------------ sanitization

describe("persisted error codes carry no secrets", () => {
  const SECRET_SHAPED = [
    "sk_live_51NabcdEFGHijklmnop",
    "Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature",
    // built at runtime so the fixture is not a literal capability in the tree
    `sess${"_"}${"a1b2c3d4".repeat(2)}`,
    `recovery code acme~${"ABCDEFGH".repeat(2)}`,
    "user@example.com could not be charged",
    "https://api.paddle.com/subscriptions?api_key=pk_live_zzz",
    "subject_hash 9f2b7c1d4e5a6b8c9d0e1f2a3b4c5d6e",
  ];

  test("no secret-shaped message can reach the returned code", () => {
    for (const message of SECRET_SHAPED) {
      const code = sanitizeErrorCode(new Error(message));
      expect(PAYMENT_ERROR_CODES).toContain(code);
      expect(code).toBe("handler_error");
      for (const fragment of message.split(/\s+/)) {
        if (fragment.length > 4) expect(code).not.toContain(fragment.toLowerCase());
      }
    }
  });

  test("only allowlisted controlled codes survive; anything else collapses", () => {
    expect(sanitizeErrorCode(new PaymentProcessingError("mirror_failed"))).toBe("mirror_failed");
    expect(sanitizeErrorCode({ code: "sk_live_leak" })).toBe("handler_error");
    expect(sanitizeErrorCode({ code: "arbitrary_code" })).toBe("handler_error");
    expect(sanitizeErrorCode("sk_live_raw_string")).toBe("handler_error");
    expect(sanitizeErrorCode(null)).toBe("unknown_error");
  });

  test("a secret-shaped failure persists only an allowlisted code and logs nothing raw", async () => {
    const logs: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    try {
      const c = await claim("evt_s1");
      await finishPaymentEvent("evt_s1", c.claimToken, new Error(SECRET_SHAPED[0]!));
    } finally {
      console.error = original;
    }
    const stored = events.get("evt_s1")!.error_code!;
    expect(stored).toBe("handler_error");
    expect(PAYMENT_ERROR_CODES).toContain(stored);
    expect(logs.join("\n")).not.toContain("sk_live");
  });

  test("the module never derives stored text from error.message", async () => {
    const src = (await Bun.file("src/lib/payment-events.server.ts").text())
      // strip comments: prose may mention error.message, code may not read it
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(src).not.toMatch(/error\.message/);
    expect(src).not.toMatch(/String\(error\)/);
  });
});

// ------------------------------------------------------------ fail closed

describe("missing subscription status never means active", () => {
  test("no verified status resolves to unknown, not granted", () => {
    for (const status of [null, undefined, ""]) {
      const d = evaluateSubscription({ status });
      expect(d.state).toBe("unknown");
      expect(d.grantsAccess).toBe(false);
    }
  });

  test("access.server no longer substitutes active for a missing status", async () => {
    const src = await Bun.file("src/lib/core/access.server.ts").text();
    expect(src).not.toMatch(/\?\s*"active"\s*:\s*status/);
  });
});
