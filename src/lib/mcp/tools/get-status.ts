import { defineTool } from "@lovable.dev/mcp-js";
import { sessionCount, SESSION_TTL_MS } from "../sessions";
import { siteUrl, stripeConfigured } from "../site";

export default defineTool({
  name: "get_status",
  title: "Server status",
  description:
    "Use this when debugging the Crawler MCP connection. Returns server health, auth mode, model availability, session store state and which capabilities are demo-only.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const modelConfigured = Boolean(
      (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.["LOVABLE_API_KEY"],
    );
    return {
      content: [
        {
          type: "text",
          text: `Crawler MCP is healthy. Auth mode: none (public MVP). Interview model ${modelConfigured ? "configured" : "NOT configured"}. Analytics: demo data. Checkout: ${stripeConfigured() ? "live" : "demo"}.`,
        },
      ],
      structuredContent: {
        status: "ok",
        time: new Date().toISOString(),
        auth_mode: "none",
        auth_note:
          "All tools are public and unauthenticated. No ChatGPT account identity is available to this server. Durable per-user persistence, subscription status and private analytics require account linking / OAuth 2.1, which is planned but not enabled.",
        interview_model_configured: modelConfigured,
        analytics_mode: "demo",
        checkout_mode: stripeConfigured() ? "live" : "demo",
        session_store: { type: "in-memory", ephemeral: true, ttl_hours: SESSION_TTL_MS / 3600000, active_sessions: sessionCount() },
        website: siteUrl(),
      },
    };
  },
});
