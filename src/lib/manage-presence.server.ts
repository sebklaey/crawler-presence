/**
 * One authority for every browser management surface (overview, analytics,
 * retention, team, visibility, custom domains, billing).
 *
 * The slug always comes from the verified HttpOnly management cookie. No
 * handler accepts a recovery code or a slug from the request body, so the
 * browser never has to hold the capability after the initial exchange.
 */
import type { PublishedPresence } from "./mcp/presences";

export type ManageAuthError = {
  error: "unauthenticated" | "csrf" | "not-found" | "rate-limited" | "unavailable";
};

export type ManagedPresence = { presence: PublishedPresence; slug: string };

/**
 * @param write  state-changing call — requires the bound CSRF header
 * @param rate   optional per-slug rate bucket
 */
export async function requireManagedPresence(opts: {
  write: boolean;
  rate?: { name: string; limit: number };
}): Promise<ManagedPresence | ManageAuthError> {
  const { requireManageSession } = await import("./manage-auth.server");
  const auth = await requireManageSession({ write: opts.write });
  if ("error" in auth) {
    return { error: auth.error === "csrf" ? "csrf" : "unauthenticated" };
  }

  const { getPublished, allowRequest, PresenceStoreError } = await import("./mcp/presences");
  try {
    if (opts.rate && !(await allowRequest(`${opts.rate.name}:${auth.slug}`, opts.rate.limit))) {
      return { error: "rate-limited" };
    }
    const presence = await getPublished(auth.slug);
    if (!presence) return { error: "not-found" };
    return { presence, slug: presence.slug };
  } catch (error) {
    if (error instanceof PresenceStoreError) return { error: "unavailable" };
    throw error;
  }
}
