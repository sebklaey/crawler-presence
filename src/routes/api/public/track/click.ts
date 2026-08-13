import { createFileRoute } from "@tanstack/react-router";

/**
 * Trackable outbound click. Records one measured `outbound_click` event for a
 * published Presence and redirects to the target. No cookies, no IP storage —
 * the event carries only the Presence slug, the type and a timestamp.
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

        if (slug) {
          try {
            const { getPublished } = await import("@/lib/mcp/presences");
            const presence = await getPublished(slug);
            if (presence && presence.status === "live") {
              const { recordEvent, dedupeKeyFor } = await import("@/lib/mcp/presence-analytics");
              await recordEvent({
                slug,
                eventType: "outbound_click",
                source: "web",
                dedupeKey: await dedupeKeyFor(destination.toString()),
              });
            }
          } catch (error) {
            const { logBestEffortFailure } = await import("@/lib/best-effort");
            logBestEffortFailure("outbound-click-event", error);
          }
        }

        return new Response(null, {
          status: 302,
          headers: { location: destination.toString(), "cache-control": "no-store" },
        });
      },
    },
  },
});
