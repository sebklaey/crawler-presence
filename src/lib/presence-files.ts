/**
 * Public delivery of the generated Presence files, shared by the canonical
 * `/p/<slug>/<file>` route and by custom-domain root delivery.
 */
import type { PublishedPresence } from "./mcp/presences";

export const presenceFileContentType = (type: string, path: string) => {
  if (path.endsWith(".json") || type === "json") return "application/json; charset=utf-8";
  if (path.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "text/plain; charset=utf-8";
};

/** Normalises the splat parameter into a stored file path. */
export const presenceFilePath = (splat: string | undefined) => (splat ?? "").replace(/^\/+/, "");

/**
 * Serves one generated file of a live Presence and records the read.
 * Measurement failures never break public delivery.
 */
export async function servePresenceFile(record: PublishedPresence, splat: string | undefined): Promise<Response> {
  const path = presenceFilePath(splat);
  const file = record.files.find((f) => f.path === path);
  if (!file) {
    return new Response(`File not found. Available: ${record.files.map((f) => f.path).join(", ")}`, {
      status: 404,
    });
  }

  try {
    const { recordEvent } = await import("./mcp/presence-analytics");
    await recordEvent({ slug: record.slug, eventType: "file_read", source: "crawler", filePath: file.path });
  } catch {
    /* measurement must never break public delivery */
  }

  return new Response(file.content, {
    headers: {
      "content-type": presenceFileContentType(file.type, file.path),
      "cache-control": "public, max-age=60",
      "x-crawler-mode": record.mode,
    },
  });
}
