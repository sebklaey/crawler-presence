import { createFileRoute } from "@tanstack/react-router";

import { getLivePresence } from "@/lib/mcp/presences";
import { servePresenceFile } from "@/lib/presence-files";

/** Stable public delivery of the generated Presence files. */
export const Route = createFileRoute("/p/$slug/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        let record;
        try {
          record = await getLivePresence(params.slug);
        } catch {
          // Database unavailable: say so instead of serving a stale copy.
          return new Response("Presence temporarily unavailable", { status: 503 });
        }
        if (!record) return new Response("Presence not found", { status: 404 });

        return servePresenceFile(record, params._splat);
      },
    },
  },
});
