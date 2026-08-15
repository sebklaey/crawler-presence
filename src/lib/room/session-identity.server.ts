/**
 * Stable mapping between a Crawler draft session (sess_…) and the anonymous
 * room identity of the same person.
 *
 * ChatGPT sometimes forgets the opaque room_token between turns. Without a
 * mapping, every later call would create a brand new anonymous identity and the
 * existing profile (handle, rooms, follows) would look "missing". The mapping
 * stores either the room_token or — for identities recovered by support — the
 * derived subject hash directly. There are still no accounts: both values are
 * opaque capability tokens and never leave the server unchanged.
 */

export type SessionIdentity = { roomToken: string | null; subjectHash: string | null };

async function db() {
  const { getDb } = await import("./store");
  return getDb();
}

export async function identityForSession(sessionToken: string): Promise<SessionIdentity> {
  try {
    const client = await db();
    const { data } = await client
      .from("session_room_tokens")
      .select("room_token, subject_hash")
      .eq("session_token", sessionToken)
      .maybeSingle();
    const row = (data as { room_token?: string | null; subject_hash?: string | null } | null) ?? null;
    return {
      roomToken: row?.room_token?.trim() || null,
      subjectHash: row?.subject_hash?.trim() || null,
    };
  } catch {
    return { roomToken: null, subjectHash: null };
  }
}

/** First writer wins: an existing identity is never re-pointed silently. */
export async function rememberRoomTokenForSession(
  sessionToken: string,
  roomToken: string,
): Promise<void> {
  try {
    const client = await db();
    await client
      .from("session_room_tokens")
      .insert({ session_token: sessionToken, room_token: roomToken });
  } catch {
    /* mapping is best effort */
  }
}
