/**
 * Browser side of the management session.
 *
 * The recovery code leaves the browser exactly once, to `/api/manage-session`.
 * The server answers with an HttpOnly, Secure, SameSite=Strict cookie; the
 * only thing readable here afterwards is the CSRF token, which is useless on
 * its own. The code itself is dropped from memory by the caller as soon as
 * this call returns.
 */

export const MANAGE_CSRF_COOKIE = "crawler_manage_csrf";
export const MANAGE_CSRF_HEADER = "x-crawler-csrf";
const MANAGE_SLUG_KEY = "crawler.manage.slug";

export type ManageSessionResult =
  | { ok: true; slug: string }
  | { ok: false; reason: "invalid-code" | "not-found" | "rate-limited" | "unavailable" };

/** Reads the non-secret double-submit token the server set alongside the cookie. */
export function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${MANAGE_CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : "";
}

export async function openManageSession(code: string): Promise<ManageSessionResult> {
  try {
    const response = await fetch("/api/manage-session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      referrerPolicy: "no-referrer",
      body: JSON.stringify({ code }),
    });
    const body = (await response.json().catch(() => ({}))) as ManageSessionResult;
    if (body && body.ok) {
      try {
        window.sessionStorage.setItem(MANAGE_SLUG_KEY, body.slug);
      } catch {
        /* ignore */
      }
      return body;
    }
    return { ok: false, reason: (body as { reason?: ManageSessionResult["ok"] extends true ? never : "invalid-code" }).reason ?? "unavailable" } as ManageSessionResult;
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function closeManageSession(): Promise<void> {
  try {
    window.sessionStorage.removeItem(MANAGE_SLUG_KEY);
  } catch {
    /* ignore */
  }
  await fetch("/api/manage-session", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "close" }),
  }).catch(() => undefined);
}

/** Slug of the open management session, or null. Never a capability. */
export function manageSessionSlug(): string | null {
  try {
    return window.sessionStorage.getItem(MANAGE_SLUG_KEY);
  } catch {
    return null;
  }
}

export async function manageSessionActive(): Promise<{ active: boolean; slug: string | null }> {
  try {
    const response = await fetch("/api/manage-session", { credentials: "same-origin" });
    return (await response.json()) as { active: boolean; slug: string | null };
  } catch {
    return { active: false, slug: null };
  }
}
