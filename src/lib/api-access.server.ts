/**
 * Capability-based REST API access for published Presences.
 *
 * There are no accounts and no API keys to manage: the caller sends the same
 * recovery code that already controls the Presence. Only Business Presences
 * may use the API; every request is rate limited and never echoes the secret.
 */
import { allowRequest, parseRecoveryCode, verifyManageSecret, type PublishedPresence } from "./mcp/presences";

export const API_PLANS = ["business"];

export type ApiAuth =
  | { ok: true; presence: PublishedPresence }
  | { ok: false; status: number; error: string };

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

/** Reads `Authorization: Bearer <slug>~<secret>` or `x-crawler-code`. */
export async function authenticate(request: Request): Promise<ApiAuth> {
  const header = request.headers.get("authorization");
  const raw = header?.toLowerCase().startsWith("bearer ")
    ? header.slice(7)
    : (request.headers.get("x-crawler-code") ?? "");
  const parsed = parseRecoveryCode(raw);
  if (!parsed) return { ok: false, status: 401, error: "Missing or malformed recovery code." };

  try {
    if (!(await allowRequest(`api:${parsed.slug}`, 120)))
      return { ok: false, status: 429, error: "Rate limit exceeded (120 requests per minute)." };
    const presence = await verifyManageSecret(parsed.slug, parsed.secret);
    if (!presence) return { ok: false, status: 401, error: "Invalid recovery code." };
    if (!API_PLANS.includes(presence.plan))
      return { ok: false, status: 403, error: "API access requires the Business plan." };
    return { ok: true, presence };
  } catch (error) {
    // 503, never 401: a failed lookup says nothing about the code the caller sent.
    console.error(
      "[crawler] api authentication failed",
      error instanceof Error ? error.message : String(error),
    );
    return { ok: false, status: 503, error: "Crawler is temporarily unavailable." };
  }
}
