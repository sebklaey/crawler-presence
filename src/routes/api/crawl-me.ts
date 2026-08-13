import { createFileRoute } from "@tanstack/react-router";

/**
 * CrawlMe — public read-only retrieval of a published Knowledge Core.
 *
 *   GET /api/crawl-me?domain=sebklaey.app
 *   GET /api/crawl-me?id=<entity-id>&section=pricing
 *   GET /api/crawl-me?url=https://crawler.today/p/<entity-id>&format=summary
 *
 * No write operations exist here. Updates keep going through the existing
 * recovery-code publishing workflow.
 */
export const Route = createFileRoute("/api/crawl-me")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { CORS_HEADERS } = await import("@/lib/crawlme.server");
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      },
      GET: async ({ request }) => {
        const {
          apiError,
          clientIp,
          clientLabel,
          entityEtag,
          entityPayload,
          entitySection,
          entitySummary,
          entityUpdates,
          isInternalTraffic,
          jsonResponse,
          recordRetrieval,
          resolveEntity,
        } = await import("@/lib/crawlme.server");
        const { ENTITY_SECTIONS } = await import("@/lib/crawlme");

        const url = new URL(request.url);
        const q = (name: string) => {
          const value = url.searchParams.get(name)?.trim();
          return value && value.length <= 300 ? value : undefined;
        };

        const { allowRequest } = await import("@/lib/mcp/presences");
        if (!(await allowRequest(`crawlme:${clientIp(request)}`, 120)))
          return apiError(429, "Rate limit exceeded.", "Up to 120 requests per minute per client.");

        const lookup = { id: q("id") ?? q("entity_id") ?? q("slug"), domain: q("domain"), url: q("url"), name: q("name") ?? q("q") };
        if (!lookup.id && !lookup.domain && !lookup.url && !lookup.name)
          return apiError(400, "Missing identifier.", "Pass domain, url, id or name. Use /api/search to discover entities.");

        const presence = await resolveEntity(lookup);
        if (!presence)
          return apiError(404, "No published Crawler Today entity matches this identifier.", "Try /api/search?q=…");

        const format = q("format") ?? "full";
        const section = q("section");
        if (section && !ENTITY_SECTIONS.includes(section as never))
          return apiError(400, `Unknown section "${section}".`, `Available: ${ENTITY_SECTIONS.join(", ")}`);

        const variant = section ? `section:${section}` : format;
        const etag = entityEtag(presence, variant);
        if (request.headers.get("if-none-match") === etag)
          return new Response(null, { status: 304, headers: { etag, "last-modified": new Date(presence.updatedAt).toUTCString() } });

        const body = section
          ? entitySection(presence, section as never)
          : format === "summary"
            ? entitySummary(presence)
            : format === "updates"
              ? entityUpdates(presence, { version: Number(q("version")) || undefined, since: q("since") })
              : entityPayload(presence);

        if (!isInternalTraffic(request)) {
          await recordRetrieval({
            slug: presence.slug,
            channel: "crawlme_api",
            section: section ?? format,
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
