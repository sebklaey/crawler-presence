import { defineMcp } from "@lovable.dev/mcp-js";
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
  instructions: `Crawler builds an AI-readable public Presence (a Knowledge Core) for a person, creator, studio, company, organization or project. Crawler publishes AI-readable text files only — it never sells, ships or fulfils physical goods.

Typical flow: start_interview -> continue_interview (repeat until interview_complete) -> preview_presence -> publish_presence / get_checkout_link. Use analyze_source_url when the user pastes a link, get_analytics for performance questions and improve_presence to turn an insight into the next question.

Important: this endpoint is public and unauthenticated (auth type "none"). Crawler has no user registration, no login and no user accounts, and no ChatGPT account identity is passed to this server — never claim otherwise. Sessions are anonymous durable drafts keyed by an opaque session_id and stored for ~30 days; public Presence analytics are measured inside Crawler and free to query by domain, URL, entity name or public slug via get_analytics (e.g. \u201cwie oft wurde \u00fcber sebklaey.app geredet?\u201d); detailed analytics require the Presence recovery code. Crawler only measures its own tool calls and observable reads of published Presence files \u2014 never all ChatGPT, Claude, Gemini or internet conversations. Publishing is the paid step and is completed on the Crawler website; afterwards publish_presence returns a one-time recovery code that is the only way to manage the published Presence. Never claim access to private ChatGPT, Claude or Gemini conversations.`,
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
