import { createFileRoute } from "@tanstack/react-router";

/** Business API: the Presence itself — Knowledge Core, plan and generated files. */
export const Route = createFileRoute("/api/public/v1/presence")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authenticate, jsonError } = await import("@/lib/api-access.server");
        const auth = await authenticate(request);
        if (!auth.ok) return jsonError(auth.status, auth.error);
        const p = auth.presence;

        return Response.json(
          {
            slug: p.slug,
            name: p.core?.name ?? p.slug,
            plan: p.plan,
            mode: p.mode,
            status: p.status,
            published_at: p.publishedAt,
            subscription_status: p.subscriptionStatus,
            current_period_end: p.currentPeriodEnd,
            custom_domain: p.customDomain,
            custom_domain_verified: Boolean(p.customDomainVerifiedAt),
            knowledge_core: p.core,
            files: p.files.map((f) => ({ path: f.path, type: f.type, bytes: f.content.length })),
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
