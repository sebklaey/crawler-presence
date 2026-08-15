/**
 * Browser management session — server-only.
 *
 * The independent recovery code is verified exactly once, by
 * `/api/manage-session`. Everything afterwards is authorised by an HttpOnly,
 * Secure, SameSite=Strict cookie whose payload carries the slug. The browser
 * never holds the capability again, and no management handler ever accepts a
 * slug or a code from the request body as authority.
 *
 * State-changing calls additionally require the CSRF token that is bound into
 * the cookie MAC (double submit): the readable companion cookie alone is not
 * enough, because the token must match the one signed into the session.
 */

const COOKIE = "crawler_manage";
const CSRF_COOKIE = "crawler_manage_csrf";
const CSRF_HEADER = "x-crawler-csrf";
const MAX_AGE = 30 * 60; // 30 minutes

export { COOKIE as MANAGE_COOKIE, CSRF_COOKIE as MANAGE_CSRF_COOKIE, CSRF_HEADER as MANAGE_CSRF_HEADER, MAX_AGE as MANAGE_MAX_AGE };

/** Fails closed: without a real server secret no session can be signed. */
function signingSecret(): string {
  const secret = (process.env["MANAGE_COOKIE_SECRET"] ?? process.env["SUBJECT_HASH_SECRET"] ?? "").trim();
  if (secret.length < 16) {
    throw new Error("MANAGE_SESSION_SECRET_MISSING");
  }
  return secret;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Length-safe, constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueManageSession(slug: string): Promise<{ value: string; csrf: string; maxAge: number }> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const csrf = crypto.randomUUID().replace(/-/g, "");
  const payload = `${slug}.${exp}.${csrf}`;
  return { value: `${payload}.${await sign(payload)}`, csrf, maxAge: MAX_AGE };
}

export async function verifyManageSession(
  value: string | undefined | null,
  csrf?: string | undefined | null,
): Promise<{ slug: string } | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [slug, exp, boundCsrf, mac] = parts as [string, string, string, string];
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 < Date.now()) return null;
  // `csrf === undefined` means "read-only call, no CSRF required".
  if (csrf !== undefined && (!csrf || !timingSafeEqual(csrf, boundCsrf))) return null;
  let expected: string;
  try {
    expected = await sign(`${slug}.${exp}.${boundCsrf}`);
  } catch {
    return null; // no signing secret -> nothing can be trusted
  }
  if (!timingSafeEqual(expected, mac)) return null;
  return { slug };
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0) out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim());
  }
  return out;
}

export function serializeCookie(
  name: string,
  value: string,
  opts: { httpOnly: boolean; maxAge: number },
): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${opts.maxAge}; SameSite=Strict; Secure${
    opts.httpOnly ? "; HttpOnly" : ""
  }`;
}

export type ManageAuth = { slug: string } | { error: "unauthenticated" | "csrf" };

/**
 * Reads the management session from the *ambient request* of a server
 * function. `write: true` also enforces the bound CSRF header.
 */
export async function requireManageSession(opts: { write: boolean }): Promise<ManageAuth> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const jar = parseCookies(getRequestHeader("cookie"));
  const csrf = opts.write ? (getRequestHeader(CSRF_HEADER) ?? "") : undefined;
  const session = await verifyManageSession(jar[COOKIE], csrf);
  if (!session) {
    // Distinguish "no session" from "session but wrong CSRF" for the client.
    if (opts.write && (await verifyManageSession(jar[COOKIE]))) return { error: "csrf" };
    return { error: "unauthenticated" };
  }
  return { slug: session.slug };
}
