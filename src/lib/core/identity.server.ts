/**
 * Crawler Core — the one typed identity resolver.
 *
 * Invariants enforced here (and asserted by `tests/identity.test.ts`):
 *  - `subjectId` (HMAC of the room capability) is the canonical identity.
 *  - The same valid session always resolves to the same subject and the same
 *    room token, serially and in parallel.
 *  - A read-only call NEVER invents a room token. Only an explicitly mutating
 *    call bootstraps and persists exactly one anonymous identity.
 *  - Session id, room identity token and management/recovery code are three
 *    separate capabilities. A session id is never accepted as a room token and
 *    never as a recovery code.
 *  - If both a session and a room token are supplied and they resolve to
 *    different subjects, a typed IDENTITY_CONFLICT is returned and nothing is
 *    written.
 */

export type IdentityContext = {
  ok: true;
  /** Canonical, stable identity of the caller (never a raw capability). */
  subjectId: string | null;
  /** Room capability to echo back to the caller, or null when none exists. */
  roomToken: string | null;
  /** True only when this call created and persisted a brand new identity. */
  issued: boolean;
  sessionId: string | null;
};

export type IdentityConflict = {
  ok: false;
  error: "IDENTITY_CONFLICT";
  message: string;
  retryable: false;
  correlation_id: string;
};

/** The identity store could not be read or written. Never degrade to a new
 *  anonymous identity — that would orphan the caller's rooms and profile. */
export type IdentityUnavailable = {
  ok: false;
  error: "TEMPORARILY_UNAVAILABLE";
  message: string;
  retryable: true;
  correlation_id: string;
};

export type IdentityResult = IdentityContext | IdentityConflict | IdentityUnavailable;

export const SESSION_PREFIX = "sess_";

/** A draft session id is not a room capability — reject it explicitly. */
export const looksLikeSessionId = (value: string): boolean => value.startsWith(SESSION_PREFIX);

function randomRoomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function subjectIdForRoomToken(roomToken: string): Promise<string | null> {
  try {
    const { resolveIdentity } = await import("../room/identity");
    const identity = await resolveIdentity({ "room/token": roomToken } as never);
    return identity.subjectHash;
  } catch {
    return null;
  }
}

/**
 * Resolves the caller identity for one MCP tool call.
 *
 * @param mutating true when the tool is allowed to create state. Read-only
 *                 tools pass false and therefore never bootstrap an identity.
 */
export async function resolveIdentityContext(input: {
  roomToken?: string | null;
  sessionId?: string | null;
  mutating: boolean;
  correlationId?: string;
}): Promise<IdentityResult> {
  const { newCorrelationId } = await import("./access.server");
  const correlationId = input.correlationId ?? newCorrelationId();

  const rawToken = input.roomToken?.trim() || null;
  const sessionId = input.sessionId?.trim() || null;

  // A session id must never be usable as a room capability.
  const providedToken = rawToken && !looksLikeSessionId(rawToken) ? rawToken : null;

  const { identityForSession, rememberRoomTokenForSession } = await import(
    "../room/session-identity.server"
  );

  const unavailable = (): IdentityResult => ({
    ok: false,
    error: "TEMPORARILY_UNAVAILABLE",
    message:
      "Crawler cannot reach the identity store right now. Nothing was changed and no new identity was created. Please retry in a moment.",
    retryable: true,
    correlation_id: correlationId,
  });

  let mappedToken: string | null = null;
  let mappedSubject: string | null = null;
  if (sessionId) {
    try {
      const mapped = await identityForSession(sessionId);
      mappedToken = mapped.roomToken;
      mappedSubject = mapped.subjectHash;
    } catch {
      return unavailable();
    }
  }

  // Both credentials present: they must describe the same person.
  if (providedToken && (mappedToken || mappedSubject)) {
    const providedSubject = await subjectIdForRoomToken(providedToken);
    const sessionSubject = mappedSubject ?? (mappedToken ? await subjectIdForRoomToken(mappedToken) : null);
    if (providedSubject && sessionSubject && providedSubject !== sessionSubject) {
      return {
        ok: false,
        error: "IDENTITY_CONFLICT",
        message:
          "This session_id and this room_token belong to two different anonymous identities. Nothing was changed. Send only one of them, or start a new anonymous identity.",
        retryable: false,
        correlation_id: correlationId,
      };
    }
    return { ok: true, subjectId: providedSubject, roomToken: providedToken, issued: false, sessionId };
  }

  if (providedToken) {
    return {
      ok: true,
      subjectId: await subjectIdForRoomToken(providedToken),
      roomToken: providedToken,
      issued: false,
      sessionId,
    };
  }

  if (mappedToken) {
    return {
      ok: true,
      subjectId: mappedSubject ?? (await subjectIdForRoomToken(mappedToken)),
      roomToken: mappedToken,
      issued: false,
      sessionId,
    };
  }

  if (mappedSubject) {
    // Support-recovered identity: the subject is known, the raw capability is
    // deliberately not reconstructible.
    return { ok: true, subjectId: mappedSubject, roomToken: null, issued: false, sessionId };
  }

  // Nothing known. A read-only call must not create anything.
  if (!input.mutating) {
    return { ok: true, subjectId: null, roomToken: null, issued: false, sessionId };
  }

  // Explicit first-use bootstrap: issue exactly one identity.
  const token = randomRoomToken();
  if (sessionId) {
    // Unique constraint on session_token makes this safe under parallel calls:
    // whoever loses the race simply re-reads the winner's token.
    try {
      await rememberRoomTokenForSession(sessionId, token);
    } catch {
      return unavailable();
    }
    let settled: { roomToken: string | null; subjectHash: string | null };
    try {
      settled = await identityForSession(sessionId);
    } catch {
      return unavailable();
    }
    const winner = settled.roomToken ?? token;
    return {
      ok: true,
      subjectId: settled.subjectHash ?? (await subjectIdForRoomToken(winner)),
      roomToken: winner,
      issued: winner === token,
      sessionId,
    };
  }

  return {
    ok: true,
    subjectId: await subjectIdForRoomToken(token),
    roomToken: token,
    issued: true,
    sessionId,
  };
}
