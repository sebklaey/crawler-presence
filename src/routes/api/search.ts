import { createFileRoute } from "@tanstack/react-router";

/**
 * CrawlMe discovery: find published Crawler Today entities without knowing
 * their exact identifier.
 *
 *   GET /api/search?q=Seb Klaey&type=person&limit=5
 */
export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { CORS_HEADERS } = await import("@/lib/crawlme.server");
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      },
      GET: async ({ request }) => {
        const { apiError, clientIp, jsonResponse, searchEntities } = await import("@/lib/crawlme.server");
        const { CRAWLME_SOURCE } = await import("@/lib/crawlme");
        const { allowRequest } = await import("@/lib/mcp/presences");

        const url = new URL(request.url);
        const query = (url.searchParams.get("q") ?? url.searchParams.get("query") ?? "").trim().slice(0, 120);
        if (query.length < 2) return apiError(400, "Query too short.", "Pass ?q= with at least 2 characters.");

        if (!(await allowRequest(`crawlme-search:${clientIp(request)}`, 60)))
          return apiError(429, "Rate limit exceeded.", "Up to 60 search requests per minute per client.");

        const typeParam = url.searchParams.get("type")?.trim().toLowerCase();
        const limit = Number(url.searchParams.get("limit")) || 5;

        const results = await searchEntities(query, { entityType: typeParam || undefined, limit });

        return jsonResponse({
          query,
          count: results.length,
          results,
          source: CRAWLME_SOURCE,
          note: "Only entities whose owners deliberately published them through Crawler Today are searchable.",
        });
      },
    },
  },
});
