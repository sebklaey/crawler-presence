import { createFileRoute } from "@tanstack/react-router";

/**
 * Trackable outbound click. Records one measured `outbound_click` event for a
 * published Presence and redirects to the target. No cookies, no IP storage —
 * the event carries only the Presence slug, the type and a timestamp.
 *
 * The redirect target must be a link the named Presence actually publishes, so
 * this endpoint cannot be abused as an open redirect on the Crawler domain.
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
        if (!slug) return new Response("Unknown target", { status: 400 });

        let presence;
        try {
          const { getPublished } = await import("@/lib/mcp/presences");
          presence = await getPublished(slug);
        } catch {
          return new Response("Temporarily unavailable", { status: 503 });
        }
        if (!presence || presence.status !== "live") return new Response("Unknown target", { status: 400 });

        // Allowed hosts are exactly the hosts this Presence links to in its own
        // published files.
        const allowed = new Set<string>();
        for (const file of presence.files ?? []) {
          for (const match of String(file.content ?? "").matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)) {
            try {
              allowed.add(new URL(match[0]).hostname.toLowerCase());
            } catch {
              /* ignore unparsable link */
            }
          }
        }
        const host = destination.hostname.toLowerCase();
        const permitted = [...allowed].some((a) => a === host || host.endsWith(`.${a}`));
        if (!permitted) return new Response("Target is not linked by this Presence", { status: 400 });

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
