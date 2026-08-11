import { createFileRoute } from "@tanstack/react-router";

import { SESSION_TTL_MS, sessionCount, storeMode } from "@/lib/mcp/sessions";
import { stripeConfigured } from "@/lib/mcp/site";

export const Route = createFileRoute("/api/public/mcp-health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Report the origin this request actually arrived on, so production
        // returns its own https URL instead of a hardcoded one.
        const origin = new URL(request.url).origin;
        const mode = await storeMode();
        return Response.json(
          {
            status: "ok",
            service: "crawler-mcp",
            origin,
            mcp_endpoint: `${origin}/mcp`,
            time: new Date().toISOString(),
            auth_mode: "none",
            auth_note:
              "Public no-auth MVP. No ChatGPT account identity is available. Building and previewing need no account; durable ownership, subscription management, private analytics, team access and cross-device recovery require account linking on the Crawler website.",
            interview_model_configured: Boolean(process.env["LOVABLE_API_KEY"]),
            analytics_mode: "demo",
            checkout_mode: stripeConfigured() ? "live" : "demo",
            session_store: {
              type: mode,
              durable: mode === "database",
              retention_days: SESSION_TTL_MS / 86_400_000,
              active_sessions: await sessionCount(),
            },
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
