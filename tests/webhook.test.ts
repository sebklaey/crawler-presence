/**
 * Paddle webhook: signature, idempotency, ordering and the billing state machine.
 * Run: bun test tests/webhook.test.ts
 *
 * Everything provider-side is mocked. No real secret or capability appears here.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { classifySubscriptionStatus, evaluateSubscription, isStaleEvent } from "../src/lib/billing/subscription-state";

// ---------------------------------------------------------------- state machine

describe("subscription state machine", () => {
  test("active and trialing grant access", () => {
    for (const status of ["active", "trialing"]) {
      const d = evaluateSubscription({ status });
      expect(d.grantsAccess).toBe(true);
      expect(d.unknown).toBe(false);
    }
  });

  test("past_due keeps access during dunning", () => {
    expect(evaluateSubscription({ status: "past_due" }).grantsAccess).toBe(true);
  });

  test("paused denies access", () => {
    const d = evaluateSubscription({ status: "paused" });
    expect(d.grantsAccess).toBe(false);
    expect(d.decision).toBe("denied");
  });

  test("canceled keeps access only inside the paid period", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(evaluateSubscription({ status: "canceled", currentPeriodEnd: future }).grantsAccess).toBe(true);
    expect(evaluateSubscription({ status: "canceled", currentPeriodEnd: past }).grantsAccess).toBe(false);
  });

  test("expired and unpaid deny access once the period is over", () => {
    expect(classifySubscriptionStatus("unpaid")).toBe("expired");
    expect(evaluateSubscription({ status: "unpaid" }).grantsAccess).toBe(false);
    expect(evaluateSubscription({ status: "expired" }).grantsAccess).toBe(false);
  });

  test("an unrecognised status fails closed as unknown, never as free", () => {
    const d = evaluateSubscription({ status: "wat_is_this" });
    expect(d.state).toBe("unknown");
    expect(d.decision).toBe("unknown");
    expect(d.unknown).toBe(true);
    expect(d.grantsAccess).toBe(false);
  });

  test("stale events are detected by occurrence time", () => {
    const older = "2026-01-01T00:00:00.000Z";
    const newer = "2026-02-01T00:00:00.000Z";
    expect(isStaleEvent(newer, older)).toBe(true);
    expect(isStaleEvent(older, newer)).toBe(false);
    expect(isStaleEvent(null, newer)).toBe(false);
  });
});

// ---------------------------------------------------------------- handler

type Event = { id: string | null; type: string; data: Record<string, any>; occurredAt: string };

let verified: Event | null = null;
let verifyThrows = false;
const claimed = new Set<string>();
const mirrorCalls: Array<{ id: string; status: string; occurredAt: string | null; stale: boolean }> = [];
const presenceSyncs: Array<{ id: string; status: string | null; plan: string | null }> = [];
let storeAvailable = true;
let lastOccurredAt: Record<string, string> = {};

mock.module("../src/lib/paddle.server", () => ({
  verifyWebhook: async () => {
    if (verifyThrows) throw new Error("invalid signature");
    return verified;
  },
}));

mock.module("../src/lib/paddle-ips.server", () => ({
  isPaddleRequest: async () => true,
  callerIp: () => "203.0.113.1",
}));

mock.module("../src/lib/payment-events.server", () => ({
  claimPaymentEvent: async (input: { eventId: string }) => {
    if (!storeAvailable) return { claimed: false, durable: false, claimToken: null };
    if (claimed.has(input.eventId)) return { claimed: false, durable: true, claimToken: null };
    claimed.add(input.eventId);
    return { claimed: true, durable: true, claimToken: "tok_test", attempts: 1 };
  },
  finishPaymentEvent: async () => ({ applied: true, reason: "applied" }),
  sanitizeErrorCode: () => "handler_error",
}));

mock.module("../src/lib/billing-mirror.server", () => ({
  subscriptionFromEvent: (s: Record<string, any>) =>
    s["id"] ? { subscriptionId: s["id"], status: s["status"] ?? "unknown" } : null,
  isValidOccurredAt: (v: unknown) =>
    typeof v === "string" && v.trim() !== "" && !Number.isNaN(new Date(v).getTime()),
  mirrorSubscription: async (input: any, _env: string, occurredAt: string | null) => {
    const stored = lastOccurredAt[input.subscriptionId];
    if (isStaleEvent(stored, occurredAt)) {
      mirrorCalls.push({ id: input.subscriptionId, status: input.status, occurredAt, stale: true });
      return { applied: false, stale: true };
    }
    if (occurredAt) lastOccurredAt[input.subscriptionId] = occurredAt;
    mirrorCalls.push({ id: input.subscriptionId, status: input.status, occurredAt, stale: false });
    return { applied: true, stale: false };
  },
  mirrorCustomer: async () => {},
}));

mock.module("../src/lib/intents.server", () => ({ markIntentPaid: async () => {} }));

mock.module("../src/lib/mcp/presences", () => ({
  syncPresenceBilling: async (id: string, billing: { subscriptionStatus?: string | null; plan?: string | null }) => {
    presenceSyncs.push({ id, status: billing.subscriptionStatus ?? null, plan: billing.plan ?? null });
  },
}));

mock.module("../src/lib/entitlements", () => ({
  planFromPriceExternalId: () => "pro",
  applyCatalogLimit: (core: unknown) => ({ core }),
}));

const { Route } = await import("../src/routes/api/public/payments/webhook");
const POST = (Route.options as any).server.handlers.POST as (ctx: { request: Request }) => Promise<Response>;

const call = () =>
  POST({ request: new Request("https://crawler.today/api/public/payments/webhook?env=sandbox", { method: "POST" }) });

const subscriptionEvent = (id: string, status: string, occurredAt: string, eventId: string): Event => ({
  id: eventId,
  type: "subscription.updated",
  occurredAt,
  data: { id, status, customer_id: "ctm_x", current_billing_period: { ends_at: occurredAt } },
});

beforeEach(() => {
  verified = null;
  verifyThrows = false;
  claimed.clear();
  mirrorCalls.length = 0;
  presenceSyncs.length = 0;
  storeAvailable = true;
  lastOccurredAt = {};
});

describe("payments webhook", () => {
  test("an invalid signature is rejected before any write", async () => {
    verifyThrows = true;
    const res = await call();
    expect(res.status).toBe(400);
    expect(mirrorCalls).toHaveLength(0);
    expect(presenceSyncs).toHaveLength(0);
  });

  test("an event without an id is rejected", async () => {
    verified = { ...subscriptionEvent("sub_1", "active", "2026-01-01T00:00:00Z", "evt_1"), id: null };
    const res = await call();
    expect(res.status).toBe(400);
    expect(mirrorCalls).toHaveLength(0);
  });

  test("a duplicate delivery is a successful no-op", async () => {
    verified = subscriptionEvent("sub_1", "active", "2026-01-01T00:00:00Z", "evt_dup");
    const first = await call();
    expect(first.status).toBe(200);
    expect(mirrorCalls).toHaveLength(1);

    const second = await call();
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ received: true, duplicate: true });
    expect(mirrorCalls).toHaveLength(1);
  });

  test("a reordered stale event cannot regress newer state", async () => {
    verified = subscriptionEvent("sub_2", "active", "2026-02-01T00:00:00Z", "evt_new");
    await call();
    verified = subscriptionEvent("sub_2", "canceled", "2026-01-01T00:00:00Z", "evt_old");
    await call();

    expect(mirrorCalls.at(-1)).toMatchObject({ status: "canceled", stale: true });
    // The stale event never reached presence fulfilment.
    expect(presenceSyncs.map((s) => s.status)).toEqual(["active"]);
  });

  test("activation is applied only from the verified webhook", async () => {
    verified = subscriptionEvent("sub_3", "active", "2026-03-01T00:00:00Z", "evt_act");
    await call();
    expect(presenceSyncs).toEqual([{ id: "sub_3", status: "active", plan: "pro" }]);
  });

  test("past_due, paused and unknown statuses are forwarded verbatim, never as free", async () => {
    for (const [index, status] of ["past_due", "paused", "weird_status"].entries()) {
      verified = subscriptionEvent("sub_4", status, `2026-04-0${index + 1}T00:00:00Z`, `evt_${status}`);
      await call();
    }
    expect(presenceSyncs.map((s) => s.status)).toEqual(["past_due", "paused", "weird_status"]);
    expect(presenceSyncs.every((s) => s.plan === "pro")).toBe(true);
  });

  test("cancellation is recorded without wiping the plan", async () => {
    verified = {
      ...subscriptionEvent("sub_5", "active", "2026-05-01T00:00:00Z", "evt_cancel"),
      type: "subscription.canceled",
    };
    await call();
    expect(presenceSyncs).toEqual([{ id: "sub_5", status: "canceled", plan: null }]);
  });

  test("a storage outage asks the provider to retry instead of dropping the event", async () => {
    storeAvailable = false;
    verified = subscriptionEvent("sub_6", "active", "2026-06-01T00:00:00Z", "evt_out");
    const res = await call();
    expect(res.status).toBe(503);
    expect(mirrorCalls).toHaveLength(0);
  });
});
