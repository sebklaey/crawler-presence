/**
 * Stable mapping between a Crawler draft session (sess_…) and the anonymous
 * room identity of the same person.
 *
 * ChatGPT sometimes forgets the opaque room_token between turns. Without a
 * mapping, every later call would create a brand new anonymous identity and the
 * existing profile (handle, rooms, follows) would look "missing".
 *
 * The session capability itself is NEVER stored. Lookups and inserts go through
 * the SHA-256 hash with the `crawler-session-v1:` domain separator, exactly
 * like `published_presences.session_token_hash`. Revoked mappings (after an
 * owner reissue) stop resolving.
 *
 * Persistence failures are NOT swallowed: a caller that needs a durable
 * identity gets a typed TEMPORARILY_UNAVAILABLE instead of a silent new
 * identity that would orphan the person's rooms and profile.
 */
import { hashSessionToken } from "../mcp/presences";

export type SessionIdentity = { roomToken: string | null; subjectHash: string | null };

export class IdentityStoreUnavailable extends Error {
  readonly code = "TEMPORARILY_UNAVAILABLE" as const;
  constructor(message = "The identity store is temporarily unavailable.") {
    super(message);
    this.name = "IdentityStoreUnavailable";
  }
}

async function db() {
  const { getDb } = await import("./store");
  return getDb();
}

/** Placeholder written into the legacy plaintext column, never a capability. */
const redactedFor = (hash: string) => `redacted:${hash.slice(0, 32)}`;

export async function identityForSession(sessionToken: string): Promise<SessionIdentity> {
  const hash = await hashSessionToken(sessionToken);
  let data: unknown;
  try {
    const client = await db();
    const result = await client
      .from("session_room_tokens")
      .select("room_token, subject_hash, revoked_at")
      .eq("session_token_hash", hash)
      .is("revoked_at", null)
      .maybeSingle();
    if (result.error) throw new IdentityStoreUnavailable(result.error.message);
    data = result.data;
  } catch (error) {
    if (error instanceof IdentityStoreUnavailable) throw error;
    throw new IdentityStoreUnavailable();
  }
  const row = (data as { room_token?: string | null; subject_hash?: string | null } | null) ?? null;
  return {
    roomToken: row?.room_token?.trim() || null,
    subjectHash: row?.subject_hash?.trim() || null,
  };
}

/**
 * First writer wins: an existing identity is never re-pointed silently.
 *
 * Under a parallel first call the loser hits the unique index on
 * `session_token_hash` (Postgres error 23505); that is a success for us — the
 * winner's mapping is the one identity. Any other database error is a real
 * persistence failure and surfaces as TEMPORARILY_UNAVAILABLE.
 */
export async function rememberRoomTokenForSession(
  sessionToken: string,
  roomToken: string,
): Promise<void> {
  const hash = await hashSessionToken(sessionToken);
  try {
    const client = await db();
    const { error } = await client.from("session_room_tokens").insert({
      session_token: redactedFor(hash),
      session_token_hash: hash,
      room_token: roomToken,
    });
    if (!error) return;
    const duplicate =
      (error as { code?: string }).code === "23505" || /duplicate key|unique constraint/i.test(error.message ?? "");
    if (duplicate) return;
    throw new IdentityStoreUnavailable(error.message);
  } catch (error) {
    if (error instanceof IdentityStoreUnavailable) throw error;
    throw new IdentityStoreUnavailable();
  }
}
