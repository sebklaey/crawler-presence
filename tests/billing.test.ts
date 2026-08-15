/**
 * Billing / checkout invariants.
 * Run: bun test tests/billing.test.ts
 *
 * Paddle is mocked. No real capability or provider secret appears here.
 */
import { afterEach, describe, expect, mock, test } from "bun:test";

let accessResult: { plan: string; degraded: boolean } | "throw" = { plan: "free", degraded: false };
const transactions: Array<{ plan: string; idempotencyKey: string | null }> = [];
let providerFails = false;

mock.module("../src/lib/core/access.server", () => ({
  resolveAccessContext: async () => {
    if (accessResult === "throw") throw new Error("database unreachable");
    return { ...accessResult, correlationId: "corr_test" };
  },
  newCorrelationId: () => "corr_test",
}));

mock.module("../src/lib/mcp/site", () => ({
  siteUrl: () => "https://crawler.today",
  paymentsConfigured: () => true,
  releaseVersion: () => "test",
}));

mock.module("../src/lib/entitlements/upgrade.server", () => ({
  checkoutUrlFor: async (
    plan: string,
    _slug: string | null,
    options?: { createTransaction?: boolean; idempotencyKey?: string | null },
  ) => {
    if (!options?.createTransaction) return `https://crawler.today/publish?plan=${plan}`;
    if (providerFails) throw new Error("provider outage");
    const key = options.idempotencyKey ?? null;
    const existing = transactions.find((t) => t.plan === plan && t.idempotencyKey === key && key !== null);
    if (existing) return `https://pay.example/txn/${plan}/${key}`;
    transactions.push({ plan, idempotencyKey: key });
    return `https://pay.example/txn/${plan}/${key}`;
  },
}));

const tool = (await import("../src/lib/mcp/tools/get-checkout-link")).default as {
  annotations: Record<string, boolean>;
  handler: (input: {
    plan: "plus" | "pro" | "business";
    session_id?: string;
    confirm_downgrade?: boolean;
  }) => Promise<{ structuredContent: Record<string, unknown> }>;
};

const SESSION = `sess_${"t".repeat(24)}`; // synthetic, not a real capability

afterEach(() => {
  accessResult = { plan: "free", degraded: false };
  transactions.length = 0;
  providerFails = false;
});

describe("get_checkout_link", () => {
  test("is declared as a mutating command", () => {
    expect(tool.annotations["readOnlyHint"]).toBe(false);
  });

  test("a resolver/database failure returns temporarily_unavailable and creates no transaction", async () => {
    accessResult = "throw";
    const out = await tool.handler({ plan: "pro", session_id: SESSION });
    expect(out.structuredContent["state"]).toBe("temporarily_unavailable");
    expect(out.structuredContent["checkout_url"]).toBeUndefined();
    expect(transactions).toHaveLength(0);
  });

  test("a degraded entitlement read never downgrades a paying user to free", async () => {
    accessResult = { plan: "pro", degraded: true };
    const out = await tool.handler({ plan: "pro", session_id: SESSION });
    expect(out.structuredContent["state"]).toBe("temporarily_unavailable");
    expect(transactions).toHaveLength(0);
  });

  test("the raw session capability is never used as the external idempotency key", async () => {
    await tool.handler({ plan: "plus", session_id: SESSION });
    expect(transactions).toHaveLength(1);
    const key = transactions[0]?.idempotencyKey ?? "";
    expect(key).not.toContain(SESSION);
    expect(key).not.toContain("sess_");
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  test("repeated calls with the same session create exactly one transaction", async () => {
    await Promise.all([
      tool.handler({ plan: "plus", session_id: SESSION }),
      tool.handler({ plan: "plus", session_id: SESSION }),
    ]);
    await tool.handler({ plan: "plus", session_id: SESSION });
    expect(transactions).toHaveLength(1);
  });

  test("a provider failure stays retryable and creates no duplicate intent", async () => {
    providerFails = true;
    const failed = await tool.handler({ plan: "plus", session_id: SESSION });
    expect(transactions).toHaveLength(0);
    expect(failed.structuredContent["state"]).toBe("upgrade");
    providerFails = false;
    await tool.handler({ plan: "plus", session_id: SESSION });
    await tool.handler({ plan: "plus", session_id: SESSION });
    expect(transactions).toHaveLength(1);
  });

  test("the current plan is never re-sold", async () => {
    accessResult = { plan: "pro", degraded: false };
    const out = await tool.handler({ plan: "pro", session_id: SESSION });
    expect(out.structuredContent["state"]).toBe("already_subscribed");
    expect(transactions).toHaveLength(0);
  });

  test("a downgrade needs explicit confirmation and never creates a transaction", async () => {
    accessResult = { plan: "business", degraded: false };
    const out = await tool.handler({ plan: "plus", session_id: SESSION });
    expect(out.structuredContent["state"]).toBe("downgrade");
    expect(transactions).toHaveLength(0);
  });

  test("no session id means no plan is invented and no transaction is keyed to one", async () => {
    const out = await tool.handler({ plan: "plus" });
    expect(out.structuredContent["current_plan"]).toBe("free");
    expect(transactions[0]?.idempotencyKey).toBeNull();
  });
});
