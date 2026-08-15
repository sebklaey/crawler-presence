/**
 * Owner recovery invariants.
 * Run: bun test tests/recovery.test.ts
 *
 * The database is replaced by an in-memory fake so the capability rules are
 * asserted deterministically. No real capability value appears in this file.
 */
import { afterEach, describe, expect, mock, test } from "bun:test";

type PresenceRow = {
  slug: string;
  session_token: string | null;
  session_token_hash: string | null;
  manage_secret_hash: string | null;
  recovery_state: string | null;
  billing_subscription_id: string | null;
  plan: string;
};

const rows = new Map<string, PresenceRow>();
const recoveryRequests: Array<{ slug: string }> = [];

function table(name: string) {
  if (name === "presence_recovery_requests") {
    return {
      insert: async (value: { slug: string }) => {
        recoveryRequests.push(value);
        return { error: null };
      },
    };
  }
  let slug = "";
  const api = {
    select() {
      return api;
    },
    update(patch: Partial<PresenceRow>) {
      const chain = {
        eq(_column: string, value: string) {
          slug = value;
          return chain;
        },
        select() {
          const row = rows.get(slug);
          if (!row) return Promise.resolve({ data: [], error: null });
          Object.assign(row, patch);
          return Promise.resolve({ data: [{ slug }], error: null });
        },
      };
      return chain;
    },
    eq(_column: string, value: string) {
      slug = value;
      return api;
    },
    maybeSingle() {
      return Promise.resolve({ data: rows.get(slug) ?? null, error: null });
    },
  };
  return api;
}

mock.module("../src/lib/mcp/db.server", () => ({
  db: () => ({ from: (name: string) => table(name) }),
}));

const { reissueSessionCapability, recoveryStateFor, requestAdminAssistedRecovery, newSessionCapability } =
  await import("../src/lib/mcp/recovery.server");
const { hashSessionToken, parseRecoveryCode } = await import("../src/lib/mcp/presences");

function seed(overrides: Partial<PresenceRow> = {}) {
  const row: PresenceRow = {
    slug: "acme",
    session_token: null,
    session_token_hash: "hash-of-a-previous-session",
    manage_secret_hash: "hash-of-an-independent-recovery-secret",
    recovery_state: "ok",
    billing_subscription_id: "sub_internal_1",
    plan: "pro",
    ...overrides,
  };
  rows.set(row.slug, row);
  return row;
}

afterEach(() => {
  rows.clear();
  recoveryRequests.length = 0;
});

describe("capability separation", () => {
  test("a draft session id is never a management/recovery code", () => {
    expect(parseRecoveryCode("sess_00000000000000000000000000")).toBeNull();
    expect(parseRecoveryCode("acme~sess_00000000000000000000")).toBeNull();
  });

  test("a well-formed recovery code parses into slug plus independent secret", () => {
    const parsed = parseRecoveryCode(`acme~crw_${"a".repeat(32)}`);
    expect(parsed?.slug).toBe("acme");
  });
});

describe("reissueSessionCapability", () => {
  test("returns a raw capability once and stores only its hash", async () => {
    const row = seed();
    const result = await reissueSessionCapability("acme");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessionToken.startsWith("sess_")).toBe(true);
    expect(row.session_token).toBeNull();
    expect(row.session_token_hash).toBe(await hashSessionToken(result.sessionToken));
  });

  test("revokes the previous session mapping atomically", async () => {
    const row = seed({ session_token_hash: "hash-of-the-exposed-session" });
    await reissueSessionCapability("acme");
    expect(row.session_token_hash).not.toBe("hash-of-the-exposed-session");
  });

  test("keeps the paid subscription attached by internal ids", async () => {
    const row = seed();
    await reissueSessionCapability("acme");
    expect(row.billing_subscription_id).toBe("sub_internal_1");
    expect(row.plan).toBe("pro");
  });

  test("a Presence without an independent capability stays in admin-assisted recovery", async () => {
    seed({ manage_secret_hash: null });
    expect(await recoveryStateFor("acme")).toBe("admin_assist_required");
    const result = await reissueSessionCapability("acme");
    expect(result).toEqual({ ok: false, reason: "admin-assist-required" });
  });

  test("unknown Presence cannot be recovered", async () => {
    expect(await reissueSessionCapability("nope")).toEqual({ ok: false, reason: "not-found" });
  });

  test("admin-assisted recovery is auditable and grants nothing", async () => {
    seed({ manage_secret_hash: null, recovery_state: "admin_assist_required" });
    const filed = await requestAdminAssistedRecovery({ slug: "acme", contact: "owner@example.com" });
    expect(filed.ok).toBe(true);
    expect(recoveryRequests).toHaveLength(1);
    expect(Object.values(recoveryRequests[0] as Record<string, unknown>).join(" ")).not.toContain("sess_");
  });

  test("issued capabilities are high entropy and unique", () => {
    const values = new Set(Array.from({ length: 50 }, () => newSessionCapability()));
    expect(values.size).toBe(50);
  });
});
