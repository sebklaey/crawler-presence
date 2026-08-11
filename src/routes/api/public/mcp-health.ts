import { createFileRoute } from "@tanstack/react-router";

import { SESSION_TTL_MS, sessionCount } from "@/lib/mcp/sessions";
import { siteUrl, stripeConfigured } from "@/lib/mcp/site";

export const Route = createFileRoute("/api/public/mcp-health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          {
            status: "ok",
            service: "crawler-mcp",
            mcp_endpoint: `${siteUrl()}/mcp`,
            time: new Date().toISOString(),
            auth_mode: "none",
            auth_note:
              "Public no-auth MVP. No ChatGPT account identity is available. Durable persistence, subscription status and private analytics require account linking (OAuth 2.1).",
            interview_model_configured: Boolean(process.env["LOVABLE_API_KEY"]),
            analytics_mode: "demo",
            checkout_mode: stripeConfigured() ? "live" : "demo",
            session_store: {
              type: "in-memory",
              ephemeral: true,
              ttl_hours: SESSION_TTL_MS / 3_600_000,
              active_sessions: sessionCount(),
            },
          },
          { headers: { "cache-control": "no-store" } },
        ),
    },
  },
});
