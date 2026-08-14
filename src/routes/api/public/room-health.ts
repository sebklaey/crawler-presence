import { createFileRoute } from "@tanstack/react-router";

/** Proxies the public @room service health so the /room page can show live status. */
export const Route = createFileRoute("/api/public/room-health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const res = await fetch("https://zinga-room.lovable.app/api/public/health", {
            headers: { accept: "application/json" },
          });
          const data = (await res.json()) as Record<string, unknown>;
          return Response.json(data, { headers: { "cache-control": "no-store" } });
        } catch {
          return Response.json(
            { status: "error", service: "room-mcp", database: "unknown" },
            { headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
