import { auth, defineMcp } from "@lovable.dev/mcp-js";
import analyzeSourceUrl from "./tools/analyze-source-url";
import continueInterview from "./tools/continue-interview";
import getAnalytics from "./tools/get-analytics";
import getCheckoutLink from "./tools/get-checkout-link";
import getKnowledgeCore from "./tools/get-knowledge-core";
import getPricing from "./tools/get-pricing";
import getStatus from "./tools/get-status";
import improvePresence from "./tools/improve-presence";
import previewPresence from "./tools/preview-presence";
import publishPresence from "./tools/publish-presence";
import startInterview from "./tools/start-interview";

export default defineMcp({
  name: "presence-builder-01",
  title: "Presence Builder (01)",
  version: "0.1.0",
  instructions: `Crawler builds an AI-readable public Presence (a Knowledge Core) for a person, creator, shop, product brand, manufacturer, company or project.

Typical flow: start_interview -> continue_interview (repeat until interview_complete) -> preview_presence -> publish_presence / get_checkout_link. Use analyze_source_url when the user pastes a link, get_analytics for performance questions and improve_presence to turn an insight into the next question.

Important: this server is unauthenticated. It has no ChatGPT account identity. Sessions are durable anonymous drafts keyed by an opaque session_id and stored for ~30 days without any account link; analytics are seeded demo data, and nothing is published. Durable persistence, subscription status and private analytics require account linking (OAuth 2.1) on the Crawler website. Never claim access to private ChatGPT, Claude or Gemini conversations.`,
  // exactOptionalPropertyTypes vs. the SDK's AnyToolDefinition (optional outputSchema).
  tools: ([
    startInterview,
    continueInterview,
    analyzeSourceUrl,
    getKnowledgeCore,
    previewPresence,
    publishPresence,
    getPricing,
    getAnalytics,
    improvePresence,
    getCheckoutLink,
    getStatus,
  ] as unknown) as Parameters<typeof defineMcp>[0]["tools"],
});
