import { createFileRoute } from "@tanstack/react-router";

/**
 * CrawlMe clean-URL alias — same data as /api/crawl-me, but without any query
 * string. Some assistants (Gemini in strict mode) refuse to fetch URLs that
 * look like a parameterised API, so every variant gets a plain path:
 *
 *   /c/<slug>            → full Knowledge Core (JSON)
 *   /c/<slug>/summary    → short summary
 *   /c/<slug>/pricing    → a single section
 */
export const Route = createFileRoute("/c/$slug/$")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { CORS_HEADERS } = await import("@/lib/crawlme.server");
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      },
      GET: async ({ params, request }) => {
        const {
          apiError,
          clientLabel,
          entityEtag,
          entityPayload,
          entitySection,
          entitySummary,
          isInternalTraffic,
          jsonResponse,
          recordRetrieval,
          resolveEntity,
        } = await import("@/lib/crawlme.server");
        const { ENTITY_SECTIONS } = await import("@/lib/crawlme");

        const presence = await resolveEntity({ id: params.slug, domain: params.slug });
        if (!presence)
          return apiError(404, "No published Crawler Today entity matches this identifier.", "Try /api/search?q=…");

        const variant = (params._splat ?? "").replace(/^\/+|\/+$/g, "").toLowerCase();
        const isSection = ENTITY_SECTIONS.includes(variant as never);
        if (variant && variant !== "summary" && variant !== "full" && !isSection)
          return apiError(404, `Unknown view "${variant}".`, `Available: summary, ${ENTITY_SECTIONS.join(", ")}`);

        const etag = entityEtag(presence, isSection ? `section:${variant}` : variant || "full");
        if (request.headers.get("if-none-match") === etag)
          return new Response(null, { status: 304, headers: { etag } });

        const body = isSection
          ? entitySection(presence, variant as never)
          : variant === "summary"
            ? entitySummary(presence)
            : entityPayload(presence);

        if (!isInternalTraffic(request)) {
          await recordRetrieval({
            slug: presence.slug,
            channel: "crawlme_api",
            section: variant || "full",
            client: clientLabel(request),
          });
        }

        return jsonResponse(body, {
          headers: { etag, "last-modified": new Date(presence.updatedAt).toUTCString() },
        });
      },
    },
  },
});
