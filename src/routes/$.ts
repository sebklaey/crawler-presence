import { createFileRoute } from "@tanstack/react-router";

import { getLivePresenceByDomain } from "@/lib/mcp/presences";
import { servePresenceFile } from "@/lib/presence-files";

/**
 * Custom-domain delivery. Requests that arrive on a verified custom domain get
 * that Presence's generated files straight from the root (`/llms.txt`,
 * `/about.md`, …). On the Crawler domain itself this stays a normal 404.
 */
export const Route = createFileRoute("/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const host = request.headers.get("host") ?? "";
        let record;
        try {
          record = await getLivePresenceByDomain(host);
        } catch {
          return new Response("Temporarily unavailable", { status: 503 });
        }
        if (!record) return new Response("Not found", { status: 404 });

        return servePresenceFile(record, params._splat);
      },
    },
  },
});
