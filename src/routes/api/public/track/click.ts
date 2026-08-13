import { createFileRoute } from "@tanstack/react-router";
import type { KnowledgeCore } from "@/lib/knowledge";

/** Same URL apart from a trailing slash and the default port. */
function sameTarget(a: URL, b: URL): boolean {
  const norm = (u: URL) => `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, "")}${u.search}`;
  return norm(a) === norm(b);
}

/** Every outbound URL the published Presence itself declares. */
function declaredUrls(core: KnowledgeCore): string[] {
  return [
    core.website ?? "",
    ...core.links.map((l) => l.url),
    ...core.items.map((i) => i.url ?? ""),
  ].filter(Boolean);
}

/**
 * Trackable outbound click. Records one measured `outbound_click` event for a
 * published Presence and redirects to the target. No cookies, no IP storage —
 * the event carries only the Presence slug, the type and a timestamp.
 *
 * The redirect only ever goes to a URL the referenced live Presence publishes,
 * so the endpoint cannot be used to launder links to arbitrary destinations.
 */
export const Route = createFileRoute("/api/public/track/click")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = (url.searchParams.get("slug") ?? "").trim().slice(0, 120);
        const target = (url.searchParams.get("url") ?? "").trim();

        let destination: URL;
        try {
          destination = new URL(target);
        } catch {
          return new Response("Invalid target", { status: 400 });
        }
        if (destination.protocol !== "https:" && destination.protocol !== "http:") {
          return new Response("Invalid target", { status: 400 });
        }
        if (!slug) return new Response("Missing slug", { status: 400 });

        const { getPublished } = await import("@/lib/mcp/presences");
        const presence = await getPublished(slug);
        if (!presence || presence.status !== "live")
          return new Response("Unknown presence", { status: 404 });

        const allowed = declaredUrls(presence.core).some((raw) => {
          try {
            return sameTarget(new URL(raw), destination);
          } catch {
            return false;
          }
        });
        if (!allowed)
          return new Response("Target is not published by this presence", { status: 400 });

        try {
          const { recordEvent, dedupeKeyFor } = await import("@/lib/mcp/presence-analytics");
          await recordEvent({
            slug,
            eventType: "outbound_click",
            source: "web",
            dedupeKey: await dedupeKeyFor(destination.toString()),
          });
        } catch {
          /* measurement must never block the redirect */
        }

        return new Response(null, {
          status: 302,
          headers: { location: destination.toString(), "cache-control": "no-store" },
        });
      },
    },
  },
});
