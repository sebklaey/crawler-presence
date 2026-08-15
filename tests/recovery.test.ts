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

type MappingRow = {
  session_token: string | null;
  session_token_hash: string;
  room_token: string | null;
  subject_hash: string | null;
  revoked_at: string | null;
};

const rows = new Map<string, PresenceRow>();
const mappings: MappingRow[] = [];
const recoveryRequests: Array<Record<string, unknown>> = [];

/**
 * Mirrors the real `reissue_presence_session` routine (see the migration):
 * one atomic step that replaces the Presence hash, revokes the old session
 * mappings and re-links the same stable identity to the new hash.
 */
function reissueRpc(args: { p_slug: string; p_new_session_hash: string; p_old_session_hash: string | null }) {
  const presence = rows.get(args.p_slug);
  if (!presence) return { data: { ok: false, reason: "not-found" }, error: null };
  if ((presence.recovery_state ?? "ok") === "admin_assist_required" || !presence.manage_secret_hash) {
    return { data: { ok: false, reason: "admin-assist-required" }, error: null };
  }
  const oldHash = args.p_old_session_hash ?? presence.session_token_hash;
  const previous = mappings.filter((m) => m.session_token_hash === oldHash && m.revoked_at === null);
  const room = previous[0]?.room_token ?? null;
  const subject = previous[0]?.subject_hash ?? null;
  for (const m of previous) m.revoked_at = new Date().toISOString();
  if (room !== null || subject !== null) {
    const existing = mappings.find((m) => m.session_token_hash === args.p_new_session_hash);
    if (existing) {
      existing.room_token = room ?? "recovered";
      existing.subject_hash = subject;
      existing.revoked_at = null;
    } else {
      mappings.push({
        session_token: `redacted:${args.p_new_session_hash.slice(0, 32)}`,
        session_token_hash: args.p_new_session_hash,
        room_token: room ?? "recovered",
        subject_hash: subject,
        revoked_at: null,
      });
    }
  }
  presence.session_token = null;
  presence.session_token_hash = args.p_new_session_hash;
  return {
    data: { ok: true, slug: args.p_slug, identity_preserved: room !== null || subject !== null },
    error: null,
  };
}

function table(name: string) {
  if (name === "presence_recovery_requests") {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
      insert: async (value: Record<string, unknown>) => {
        recoveryRequests.push(value);
        return { error: null };
      },
    };
    return chain;
  }
  if (name === "mcp_rate_limits") {
    const chain = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
      insert: async () => ({ error: null }),
    };
    return chain;
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
  db: () => ({
    from: (name: string) => table(name),
    rpc: async (fn: string, args: never) => {
      if (fn !== "reissue_presence_session") throw new Error(`unexpected rpc ${fn}`);
      return reissueRpc(args);
    },
  }),
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
  mappings.length = 0;
  recoveryRequests.length = 0;
});

describe("capability separation", () => {
  test("a draft session id is never a management/recovery code", () => {
    expect(parseRecoveryCode(`sess_${"0".repeat(26)}`)).toBeNull();
    expect(parseRecoveryCode(`acme~sess_${"0".repeat(24)}`)).toBeNull();
  });

  test("a well-formed recovery code parses into slug plus independent secret", () => {
    const parsed = parseRecoveryCode(`acme~crw_${"a".repeat(64)}`);
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

  test("revokes the previous session mapping and keeps the same stable subject", async () => {
    const row = seed({ session_token_hash: "hash-of-the-exposed-session" });
    mappings.push({
      session_token: null,
      session_token_hash: "hash-of-the-exposed-session",
      room_token: "room-capability",
      subject_hash: "stable-subject",
      revoked_at: null,
    });

    const result = await reissueSessionCapability("acme");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const old = mappings.find((m) => m.session_token_hash === "hash-of-the-exposed-session")!;
    expect(old.revoked_at).not.toBeNull();
    expect(row.session_token_hash).toBe(await hashSessionToken(result.sessionToken));

    const fresh = mappings.find(
      (m) => m.session_token_hash === row.session_token_hash && m.revoked_at === null,
    )!;
    expect(fresh.subject_hash).toBe("stable-subject");
    expect(fresh.room_token).toBe("room-capability");
    // Only hashes and redacted placeholders are ever stored.
    expect(fresh.session_token?.startsWith("sess_")).not.toBe(true);
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
    expect("sessionToken" in filed).toBe(false);
    expect(recoveryRequests).toHaveLength(1);
    expect(Object.values(recoveryRequests[0] as Record<string, unknown>).join(" ")).not.toContain("sess_");
  });

  test("issued capabilities are high entropy and unique", () => {
    const values = new Set(Array.from({ length: 50 }, () => newSessionCapability()));
    expect(values.size).toBe(50);
  });
});
