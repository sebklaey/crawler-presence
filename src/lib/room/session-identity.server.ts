/**
 * Stable mapping between a Crawler draft session (sess_…) and the anonymous
 * room identity (room_token) of the same person.
 *
 * ChatGPT sometimes forgets the opaque room_token between turns. Without a
 * mapping every later call would create a brand new anonymous identity and the
 * existing profile (handle, rooms, follows) would look "missing". Storing the
 * mapping server-side lets Crawler return to the same identity whenever the
 * caller still has the session id. There are still no accounts: both values are
 * opaque capability tokens.
 */

async function db() {
  const { getDb } = await import("./store");
  return getDb();
}

export async function roomTokenForSession(sessionToken: string): Promise<string | null> {
  try {
    const client = await db();
    const { data } = await client
      .from("session_room_tokens")
      .select("room_token")
      .eq("session_token", sessionToken)
      .maybeSingle();
    const token = (data as { room_token?: string } | null)?.room_token;
    return typeof token === "string" && token.trim() ? token.trim() : null;
  } catch {
    return null;
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
