import { createFileRoute } from "@tanstack/react-router";

import { activeSessionCount, SESSION_TTL_HOURS } from "@/lib/mcp/sessions";
import { checkoutMode, siteUrl } from "@/lib/mcp/site";

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
            checkout_mode: checkoutMode(),
            session_store: {
              type: "in-memory",
              ephemeral: true,
              ttl_hours: SESSION_TTL_HOURS,
              active_sessions: activeSessionCount(),
            },
          },
          { headers: { "cache-control": "no-store" } },
        ),
    },
  },
});
