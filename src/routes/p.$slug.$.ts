import { createFileRoute } from "@tanstack/react-router";

import { getLivePresence } from "@/lib/mcp/presences";

const contentType = (type: string, path: string) => {
  if (path.endsWith(".json") || type === "json") return "application/json; charset=utf-8";
  if (path.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "text/plain; charset=utf-8";
};

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
        const path = (params._splat ?? "").replace(/^\/+/, "");
        const file = record.files.find((f) => f.path === path);
        if (!file) {
          return new Response(`File not found. Available: ${record.files.map((f) => f.path).join(", ")}`, {
            status: 404,
          });
        }
        try {
          const { recordEvent } = await import("@/lib/mcp/presence-analytics");
          await recordEvent({ slug: record.slug, eventType: "file_read", source: "crawler", filePath: file.path });
        } catch {
          /* measurement must never break public delivery */
        }

        return new Response(file.content, {
          headers: {
            "content-type": contentType(file.type, file.path),
            "cache-control": "public, max-age=60",
            "x-crawler-mode": record.mode,
          },
        });
      },
    },
  },
});
