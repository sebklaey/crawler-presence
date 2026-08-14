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
          entityHtml,
          entityPayload,
          entitySection,
          entitySummary,
          htmlError,
          isInternalTraffic,
          jsonResponse,
          recordRetrieval,
          resolveEntity,
          wantsHtml,
        } = await import("@/lib/crawlme.server");
        const { ENTITY_SECTIONS } = await import("@/lib/crawlme");

        const html = wantsHtml(request);
        const presence = await resolveEntity({ id: params.slug, domain: params.slug });
        if (!presence)
          return html
            ? htmlError(
                404,
                "Presence not found",
                "No published Crawler Today entity matches this address. It may be offline or never published.",
              )
            : apiError(404, "No published Crawler Today entity matches this identifier.", "Try /api/search?q=…");

        const variant = (params._splat ?? "").replace(/^\/+|\/+$/g, "").toLowerCase();
        const isSection = ENTITY_SECTIONS.includes(variant as never);
        if (variant && variant !== "summary" && variant !== "full" && !isSection)
          return html
            ? htmlError(404, "Unknown view", `Available views: summary, ${ENTITY_SECTIONS.join(", ")}`)
            : apiError(404, `Unknown view "${variant}".`, `Available: summary, ${ENTITY_SECTIONS.join(", ")}`);

        const etag = entityEtag(presence, `${html ? "html" : "json"}:${isSection ? `section:${variant}` : variant || "full"}`);
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
          const { ingestAsync } = await import("@/lib/analytics/ingest.server");
          ingestAsync({
            presenceSlug: presence.slug,
            eventType: "api_request",
            request,
            path: `/c/${presence.slug}/${variant || "full"}`,
          });
        }

        if (html) return entityHtml(presence, body as Record<string, unknown>, variant || "full");

        return jsonResponse(body, {
          headers: { etag, "last-modified": new Date(presence.updatedAt).toUTCString() },
        });
      },

    },
  },
});
