/**
 * Webhook retry claim machine + monotonic subscription mirror.
 * Run: bun test tests/webhook-retry.test.ts
 *
 * The PostgreSQL routines are emulated faithfully (single-row locking, lease
 * expiry, attempt budget, conditional monotonic update) so the client wrappers
 * are exercised against the same semantics the migration installs.
 */
import { beforeEach, describe, expect, test } from "bun:test";

import { evaluateSubscription } from "../src/lib/billing/subscription-state";

// ------------------------------------------------------------ fake database

type EventRow = {
  event_id: string;
  status: string;
  attempts: number;
  lease_expires_at: number | null;
  error_code: string | null;
};

const MAX_ATTEMPTS = 5;
const LEASE_MS = 300_000;

let events: Map<string, EventRow>;
let subs: Map<string, { status: string; plan: string; last: number | null }>;
let now: number;
let dbUp: boolean;

function claimRpc(p: Record<string, any>) {
  const id = p["p_event_id"] as string;
  const row = events.get(id);
  if (!row) {
    events.set(id, {
      event_id: id,
      status: "processing",
      attempts: 1,
      lease_expires_at: now + LEASE_MS,
      error_code: null,
    });
    return { outcome: "claimed", attempts: 1 };
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
    return { outcome: "exhausted", attempts: row.attempts };
  }
  row.status = "processing";
  row.attempts += 1;
  row.lease_expires_at = now + LEASE_MS;
  row.error_code = null;
  return { outcome: "reclaimed", attempts: row.attempts };
}

function finishRpc(p: Record<string, any>) {
  const row = events.get(p["p_event_id"] as string);
  if (!row) return { ok: false };
  row.status = p["p_error_code"] ? "failed" : "processed";
  row.lease_expires_at = null;
  row.error_code = (p["p_error_code"] as string | null) ?? null;
  return { ok: true, status: row.status, attempts: row.attempts };
}

function mirrorRpc(p: Record<string, any>) {
  const id = p["p_subscription_id"] as string;
  const incoming = p["p_occurred_at"] ? new Date(p["p_occurred_at"] as string).getTime() : null;
  const existing = subs.get(id);
  if (existing && existing.last !== null && incoming !== null && incoming < existing.last) {
    return { applied: false, stale: true };
  }
  subs.set(id, {
    status: p["p_status"] as string,
    plan: p["p_plan"] as string,
    last: incoming ?? existing?.last ?? null,
  });
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

const { mock } = await import("bun:test");
mock.module("../src/lib/mcp/db.server", () => ({ db: fakeDb }));

const { claimPaymentEvent, finishPaymentEvent, sanitizeErrorCode } = await import(
  "../src/lib/payment-events.server"
);
const { mirrorSubscription } = await import("../src/lib/billing-mirror.server");

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
    expect(first.outcome).toBe("claimed");
    await finishPaymentEvent("evt_1");

    const replay = await claim("evt_1");
    expect(replay.claimed).toBe(false);
    expect(replay.outcome).toBe("processed");
  });

  test("a FAILED event is retried, not permanently lost", async () => {
    expect((await claim("evt_2")).claimed).toBe(true);
    await finishPaymentEvent("evt_2", new Error("provider timeout"));

    const retry = await claim("evt_2");
    expect(retry.claimed).toBe(true);
    expect(retry.outcome).toBe("reclaimed");
    expect(retry.attempts).toBe(2);
  });

  test("a concurrent worker holding a fresh lease is skipped", async () => {
    const [a, b] = await Promise.all([claim("evt_3"), claim("evt_3")]);
    expect([a.claimed, b.claimed].filter(Boolean)).toHaveLength(1);
    const skipped = a.claimed ? b : a;
    expect(skipped.outcome).toBe("in_progress");
  });

  test("an abandoned attempt (crashed worker, expired lease) is reclaimed", async () => {
    await claim("evt_4"); // never finished
    expect((await claim("evt_4")).outcome).toBe("in_progress");
    now += LEASE_MS + 1_000;
    const reclaimed = await claim("evt_4");
    expect(reclaimed.claimed).toBe(true);
    expect(reclaimed.outcome).toBe("reclaimed");
  });

  test("the attempt budget is bounded and ends in a terminal exhausted state", async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      const c = await claim("evt_5");
      expect(c.claimed).toBe(true);
      await finishPaymentEvent("evt_5", new Error("boom"));
    }
    const done = await claim("evt_5");
    expect(done.claimed).toBe(false);
    expect(done.outcome).toBe("exhausted");
  });

  test("an unavailable backend is non-durable so the provider retries", async () => {
    dbUp = false;
    const c = await claim("evt_6");
    expect(c.durable).toBe(false);
    expect(c.claimed).toBe(false);
  });

  test("only a short sanitized code is persisted, never provider error text", async () => {
    await claim("evt_7");
    await finishPaymentEvent("evt_7", new Error("apikey pk_live_abcdef leaked in body"));
    const code = events.get("evt_7")!.error_code!;
    expect(code).not.toContain("pk_live_abcdef");
    expect(code.length).toBeLessThanOrEqual(64);
    expect(sanitizeErrorCode(new Error("secret sess_zzz"))).not.toContain("sess_zzz");
  });
});

// ------------------------------------------------------------ monotonic mirror

const sub = (status: string, plan: string) =>
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

describe("monotonic subscription mirror", () => {
  test("a newer event wins and is applied", async () => {
    const r = await mirrorSubscription(sub("active", "pro"), "sandbox", "2026-02-01T00:00:00.000Z");
    expect(r.stale).toBe(false);
    expect(subs.get("sub_1")!.status).toBe("active");
  });

  test("a delayed older event cannot regress newer state", async () => {
    await mirrorSubscription(sub("canceled", "pro"), "sandbox", "2026-02-01T00:00:00.000Z");
    const late = await mirrorSubscription(sub("active", "pro"), "sandbox", "2026-01-01T00:00:00.000Z");
    expect(late.stale).toBe(true);
    expect(subs.get("sub_1")!.status).toBe("canceled");
  });

  test("concurrent deliveries settle on the newest event, both orders", async () => {
    for (const order of [0, 1]) {
      subs = new Map();
      const calls = [
        () => mirrorSubscription(sub("active", "plus"), "sandbox", "2026-03-01T00:00:00.000Z"),
        () => mirrorSubscription(sub("canceled", "plus"), "sandbox", "2026-04-01T00:00:00.000Z"),
      ];
      if (order === 1) calls.reverse();
      await Promise.all(calls.map((c) => c()));
      expect(subs.get("sub_1")!.status).toBe("canceled");
    }
  });

  test("a missing database throws so the webhook fails and Paddle retries", async () => {
    dbUp = false;
    await expect(mirrorSubscription(sub("active", "pro"), "sandbox", null)).rejects.toThrow();
  });
});

// ------------------------------------------------------------ fail closed

describe("missing subscription status never means active", () => {
  test("no verified status resolves to unknown, not granted", () => {
    for (const status of [null, undefined, ""]) {
      const d = evaluateSubscription({ status });
      expect(d.state).toBe("unknown");
      expect(d.grantsAccess).toBe(false);
      expect(d.unknown).toBe(true);
    }
  });

  test("access.server no longer substitutes active for a missing status", async () => {
    const src = await Bun.file("src/lib/core/access.server.ts").text();
    expect(src).not.toMatch(/\?\s*"active"\s*:\s*status/);
  });
});
