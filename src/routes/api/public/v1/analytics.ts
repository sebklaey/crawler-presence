import { createFileRoute } from "@tanstack/react-router";

/** Business API: measured analytics for the authenticated Presence. */
export const Route = createFileRoute("/api/public/v1/analytics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authenticate, jsonError } = await import("@/lib/api-access.server");
        const auth = await authenticate(request);
        if (!auth.ok) return jsonError(auth.status, auth.error);

        const days = new URL(request.url).searchParams.get("days");
        const period = days === "7" ? 7 : 90;

        const { detailedSummary, publicSummary, PRIVACY_NOTE } = await import("@/lib/mcp/presence-analytics");
        const slug = auth.presence.slug;
        const [summary, detail] = await Promise.all([
          publicSummary(slug, slug, period),
          detailedSummary(slug, period),
        ]);

        return Response.json(
          {
            slug,
            window_days: period,
            measured_inside_crawler: true,
            summary,
            detail,
            note: PRIVACY_NOTE,
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
