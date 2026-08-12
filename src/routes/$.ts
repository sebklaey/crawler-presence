import { createFileRoute } from "@tanstack/react-router";

import { getLivePresenceByDomain } from "@/lib/mcp/presences";

const contentType = (type: string, path: string) => {
  if (path.endsWith(".json") || type === "json") return "application/json; charset=utf-8";
  if (path.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "text/plain; charset=utf-8";
};

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
