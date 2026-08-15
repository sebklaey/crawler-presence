/**
 * Identity invariants (Crawler Core).
 * Run: bun test tests/identity.test.ts
 *
 * The persistence layer is replaced by an in-memory fake so the invariants are
 * asserted deterministically, including under parallel first calls.
 */
import { afterEach, describe, expect, mock, test } from "bun:test";

type Row = { roomToken: string | null; subjectHash: string | null };

const store = new Map<string, Row>();
let writes = 0;

mock.module("../src/lib/room/session-identity.server", () => ({
  identityForSession: async (session: string): Promise<Row> =>
    store.get(session) ?? { roomToken: null, subjectHash: null },
  rememberRoomTokenForSession: async (session: string, roomToken: string) => {
    writes += 1;
    // Unique constraint on session_token: first writer wins.
    if (!store.has(session)) store.set(session, { roomToken, subjectHash: null });
  },
}));

mock.module("../src/lib/room/identity", () => ({
  // Deterministic stand-in for HMAC(secret, room_token).
  resolveIdentity: async (meta: Record<string, string>) => ({
    subjectHash: `subject:${meta["room/token"]}`,
    sessionHash: null,
    locale: null,
  }),
}));

mock.module("../src/lib/core/access.server", () => ({
  newCorrelationId: () => "corr_test",
}));

const { resolveIdentityContext } = await import("../src/lib/core/identity.server");

afterEach(() => {
  store.clear();
  writes = 0;
});

describe("resolveIdentityContext", () => {
  test("read-only call by an unknown caller never invents a token", async () => {
    const result = await resolveIdentityContext({ mutating: false });
    expect(result).toEqual({ ok: true, subjectId: null, roomToken: null, issued: false, sessionId: null });
    expect(writes).toBe(0);
    expect(store.size).toBe(0);
  });

  test("a session id is never accepted as a room token", async () => {
    const result = await resolveIdentityContext({ roomToken: "sess_abc123", mutating: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.roomToken).toBeNull();
  });

  test("serial calls with the same session resolve to one subject and one token", async () => {
    const first = await resolveIdentityContext({ sessionId: "sess_1", mutating: true });
    const second = await resolveIdentityContext({ sessionId: "sess_1", mutating: true });
    const third = await resolveIdentityContext({ sessionId: "sess_1", mutating: false });
    if (!first.ok || !second.ok || !third.ok) throw new Error("unexpected conflict");
    expect(first.issued).toBe(true);
    expect(second.issued).toBe(false);
    expect(second.roomToken).toBe(first.roomToken!);
    expect(third.roomToken).toBe(first.roomToken!);
    expect(second.subjectId).toBe(first.subjectId!);
    expect(store.size).toBe(1);
  });

  test("parallel first calls create exactly one identity", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => resolveIdentityContext({ sessionId: "sess_par", mutating: true })),
    );
    const tokens = new Set(results.map((r) => (r.ok ? r.roomToken : "conflict")));
    expect(tokens.size).toBe(1);
    expect(store.size).toBe(1);
    expect(results.filter((r) => r.ok && r.issued).length).toBeLessThanOrEqual(1);
  });

  test("mismatching session and room token yields IDENTITY_CONFLICT without writes", async () => {
    store.set("sess_owner", { roomToken: "tokenA", subjectHash: "subject:tokenA" });
    const result = await resolveIdentityContext({
      sessionId: "sess_owner",
      roomToken: "tokenB",
      mutating: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("IDENTITY_CONFLICT");
      expect(result.retryable).toBe(false);
      expect(result.correlation_id).toBe("corr_test");
    }
    expect(writes).toBe(0);
    expect(store.get("sess_owner")).toEqual({ roomToken: "tokenA", subjectHash: "subject:tokenA" });
  });

  test("matching session and room token are accepted", async () => {
    store.set("sess_ok", { roomToken: "tokenA", subjectHash: "subject:tokenA" });
    const result = await resolveIdentityContext({ sessionId: "sess_ok", roomToken: "tokenA", mutating: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.roomToken).toBe("tokenA");
      expect(result.subjectId).toBe("subject:tokenA");
      expect(result.issued).toBe(false);
    }
  });

  test("a support-recovered subject never reconstructs the raw capability", async () => {
    store.set("sess_recovered", { roomToken: null, subjectHash: "subject:known" });
    const result = await resolveIdentityContext({ sessionId: "sess_recovered", mutating: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subjectId).toBe("subject:known");
      expect(result.roomToken).toBeNull();
    }
  });
});
