import { createFileRoute } from "@tanstack/react-router";

import { SESSION_TTL_MS, sessionCount, storeMode } from "@/lib/mcp/sessions";
import { paymentsConfigured, paymentsEnvironment } from "@/lib/mcp/site";


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
              "Public no-auth endpoint. No ChatGPT account identity is available. Crawler has no user registration, no login and no user accounts. Published Presences are controlled by a capability-based recovery code, of which only a hash is stored.",
            interview_model_configured: Boolean(process.env["LOVABLE_API_KEY"]),
            analytics_mode: "demo",
            checkout_mode: paymentsConfigured() ? "live" : "demo",
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
