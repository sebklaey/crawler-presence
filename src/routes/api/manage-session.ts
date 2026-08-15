/**
 * Browser management session.
 *
 * The recovery code is verified server-side exactly once. What the browser
 * keeps afterwards is an HttpOnly, Secure, SameSite=Strict cookie with a short
 * expiry plus a double-submit CSRF token — never the capability itself.
 *
 * POST { code }            -> issues the cookie (and returns a CSRF token)
 * POST { action: "close" } -> clears it
 * GET                      -> reports whether a valid session exists
 */
import { createFileRoute } from "@tanstack/react-router";

const COOKIE = "crawler_manage";
const CSRF_COOKIE = "crawler_manage_csrf";
const MAX_AGE = 30 * 60; // 30 minutes

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    },
  });

function cookies(request: Request): Record<string, string> {
  const raw = request.headers.get("cookie") ?? "";
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const at = part.indexOf("=");
    if (at > 0) out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim());
  }
  return out;
}

async function sign(payload: string): Promise<string> {
  const secret = process.env["SUBJECT_HASH_SECRET"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function issueManageSession(slug: string): Promise<{ value: string; csrf: string }> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const csrf = crypto.randomUUID().replace(/-/g, "");
  const payload = `${slug}.${exp}.${csrf}`;
  return { value: `${payload}.${await sign(payload)}`, csrf };
}

export async function verifyManageSession(
  value: string | undefined,
  csrf?: string | undefined,
): Promise<{ slug: string } | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [slug, exp, boundCsrf, mac] = parts as [string, string, string, string];
  if (Number(exp) * 1000 < Date.now()) return null;
  if (csrf !== undefined && csrf !== boundCsrf) return null;
  if ((await sign(`${slug}.${exp}.${boundCsrf}`)) !== mac) return null;
  return { slug };
}

const setCookie = (name: string, value: string, opts: { httpOnly: boolean; maxAge: number }) =>
  `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${opts.maxAge}; SameSite=Strict; Secure${
    opts.httpOnly ? "; HttpOnly" : ""
  }`;

export const Route = createFileRoute("/api/manage-session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const jar = cookies(request);
        const session = await verifyManageSession(jar[COOKIE]);
        return json({ active: Boolean(session), slug: session?.slug ?? null });
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          code?: string;
          action?: string;
        };

        if (body.action === "close") {
          const headers = new Headers({ "content-type": "application/json" });
          headers.append("set-cookie", setCookie(COOKIE, "", { httpOnly: true, maxAge: 0 }));
          headers.append("set-cookie", setCookie(CSRF_COOKIE, "", { httpOnly: false, maxAge: 0 }));
          return new Response(JSON.stringify({ ok: true }), { headers });
        }

        const code = (body.code ?? "").trim();
        if (!code) return json({ ok: false, reason: "invalid-code" }, { status: 400 });

        const { parseRecoveryCode, verifyManageSecret, allowRequest } = await import("@/lib/mcp/presences");
        const parsed = parseRecoveryCode(code);
        // A draft session id parses to null here: it can never open a
        // management session.
        if (!parsed) return json({ ok: false, reason: "invalid-code" }, { status: 400 });
        if (!(await allowRequest(`manage-session:${parsed.rateKey}`, 20))) {
          return json({ ok: false, reason: "rate-limited" }, { status: 429 });
        }
        const presence = await verifyManageSecret(parsed.slug, parsed.secret).catch(() => null);
        if (!presence) return json({ ok: false, reason: "not-found" }, { status: 401 });

        const { value, csrf } = await issueManageSession(presence.slug);
        const headers = new Headers({
          "content-type": "application/json",
          "referrer-policy": "no-referrer",
          "cache-control": "no-store",
        });
        headers.append("set-cookie", setCookie(COOKIE, value, { httpOnly: true, maxAge: MAX_AGE }));
        headers.append("set-cookie", setCookie(CSRF_COOKIE, csrf, { httpOnly: false, maxAge: MAX_AGE }));
        return new Response(JSON.stringify({ ok: true, slug: presence.slug, csrf }), { headers });
      },
    },
  },
});
