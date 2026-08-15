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

import {
  MANAGE_COOKIE as COOKIE,
  MANAGE_CSRF_COOKIE as CSRF_COOKIE,
  MANAGE_MAX_AGE as MAX_AGE,
  issueManageSession,
  parseCookies,
  serializeCookie as setCookie,
  verifyManageSession,
} from "@/lib/manage-auth.server";

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

const cookies = (request: Request) => parseCookies(request.headers.get("cookie"));

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
          const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
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

        let issued: { value: string; csrf: string; maxAge: number };
        try {
          issued = await issueManageSession(presence.slug);
        } catch {
          return json({ ok: false, reason: "unavailable" }, { status: 503 });
        }
        const headers = new Headers({
          "content-type": "application/json",
          "referrer-policy": "no-referrer",
          "cache-control": "no-store",
        });
        headers.append("set-cookie", setCookie(COOKIE, issued.value, { httpOnly: true, maxAge: MAX_AGE }));
        headers.append("set-cookie", setCookie(CSRF_COOKIE, issued.csrf, { httpOnly: false, maxAge: MAX_AGE }));
        return new Response(JSON.stringify({ ok: true, slug: presence.slug, csrf: issued.csrf }), { headers });
      },
    },
  },
});
