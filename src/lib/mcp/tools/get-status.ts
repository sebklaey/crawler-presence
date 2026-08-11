import { defineTool } from "@lovable.dev/mcp-js";
import { sessionCount, SESSION_TTL_MS, storeMode } from "../sessions";
import { siteUrl, stripeConfigured } from "../site";

export default defineTool({
  name: "get_status",
  title: "Server status",
  description:
    "Use this when debugging the Crawler MCP connection. Returns server health, auth mode, model availability, session store state and which capabilities are demo-only.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const modelConfigured = Boolean(
      (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.["LOVABLE_API_KEY"],
    );
    const mode = await storeMode();
    return {
      content: [
        {
          type: "text",
          text: `Crawler MCP is healthy. Auth mode: none (public MVP). Session store: ${mode}. Interview model ${modelConfigured ? "configured" : "NOT configured"}. Analytics: demo data. Checkout: ${stripeConfigured() ? "live" : "demo"}.`,
        },
      ],
      structuredContent: {
        status: "ok",
        time: new Date().toISOString(),
        auth_mode: "none",
        auth_note:
          "All tools are public and unauthenticated. No ChatGPT account identity is available to this server. Building and previewing need no account; durable ownership, subscription management, private analytics, team access and cross-device recovery require account linking on the Crawler website.",
        interview_model_configured: modelConfigured,
        analytics_mode: "demo",
        checkout_mode: stripeConfigured() ? "live" : "demo",
        session_store: {
          type: mode,
          durable: mode === "database",
          retention_days: SESSION_TTL_MS / 86_400_000,
          active_sessions: await sessionCount(),
          id_format: "opaque random token (sess_ + 128 bits of entropy); database ids are never exposed",
        },
        website: siteUrl(),
      },
    };
  },
});
