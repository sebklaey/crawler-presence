import { defineTool } from "@lovable.dev/mcp-js";
import { sessionCount, SESSION_TTL_MS, storeMode } from "../sessions";
import { betaFree, paymentsConfigured, paymentsEnvironment, releaseVersion, siteUrl } from "../site";

export default defineTool({
  name: "get_status",
  title: "Server status",
  description:
    "Use this when debugging the Crawler MCP connection. Returns server health, auth mode, model availability, session store state and which capabilities are demo-only.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const mode = await storeMode();
    return {
      content: [
        {
          type: "text",
          text: `Crawler MCP is healthy. Auth mode: none (public MVP). Session store: ${mode}. Crawler runs no language model of its own: the connected assistant does the interviewing, Crawler stores and structures. Analytics: measured Crawler events only. Crawler Alpha ${releaseVersion()}: publishing always requires a paid subscription. Checkout: ${paymentsConfigured() ? `live (${paymentsEnvironment()})` : `temporarily unavailable (${paymentsEnvironment()})`}.`,
        },
      ],
      structuredContent: {
        status: "ok",
        time: new Date().toISOString(),
        auth_mode: "none",
        auth_note:
          "All tools are public and unauthenticated (auth type none). No ChatGPT account identity is available to this server. Crawler has no user registration, no login and no user accounts at all. Building and previewing are free; publishing is the paid step on the Crawler website and hands out a one-time recovery code that is the sole means of managing a published Presence.",
        own_ai_model: false,
        model_note:
          "Crawler has no own AI model. The calling assistant (e.g. ChatGPT via MCP) asks the questions and extracts structured data; Crawler merges it deterministically, generates the files and publishes.",
        analytics_mode: "measured",
        analytics_note:
          "Counts only Crawler-observable events (published file reads, API reads, Crawler tool interactions, outbound clicks). Never private assistant conversations, never a guarantee of external citation or ranking.",
        checkout_mode: paymentsConfigured() ? "live" : "unavailable",
        release_version: releaseVersion(),
        free_beta: betaFree(),
        paid_note:
          "Crawler Alpha 0.0.2: the free beta has ended. Building and previewing stay free, but publishing and hosting always require a paid subscription (Plus $5, Pro $20, Business $80 per month).",
        checkout_environment: paymentsEnvironment(),
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
