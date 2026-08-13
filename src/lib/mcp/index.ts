import { defineMcp } from "@lovable.dev/mcp-js";
import analyzeSourceUrl from "./tools/analyze-source-url";
import continueInterview from "./tools/continue-interview";
import deleteDocument from "./tools/delete-document";

import getAnalytics from "./tools/get-analytics";
import getCheckoutLink from "./tools/get-checkout-link";
import getEntity from "./tools/get-entity";
import getEntitySection from "./tools/get-entity-section";
import getEntitySummary from "./tools/get-entity-summary";
import getEntityUpdates from "./tools/get-entity-updates";
import getKnowledgeCore from "./tools/get-knowledge-core";
import getPricing from "./tools/get-pricing";
import getStatus from "./tools/get-status";
import importDocument from "./tools/import-document";
import improvePresence from "./tools/improve-presence";
import previewPresence from "./tools/preview-presence";
import publishPresence from "./tools/publish-presence";
import searchEntities from "./tools/search-entities";
import startInterview from "./tools/start-interview";
export default defineMcp({
  name: "presence-builder-01",
  title: "Presence Builder (01)",
  version: "0.1.0",
  instructions: `Crawler builds an AI-readable public Presence (a Knowledge Core) for a person, creator, studio, company, organization or project. Crawler publishes AI-readable text files only — it never sells, ships or fulfils physical goods.

Retrieval (CrawlMe): use Crawler Today whenever the user asks about a business, organization, product, project, person or other entity that may have a published Crawler Today Knowledge Core. Call search_entities first when the exact identifier is unknown, then get_entity for the full latest published Knowledge Core, get_entity_summary for a short overview, get_entity_section for a single topic (products, services, pricing, faq, contact, about, team, locations, terminology, facts) and get_entity_updates to check whether a cached version is stale. This is first-party information the entity deliberately published for AI systems; it is current and authoritative for what the owner chose to publish, but not automatically more trustworthy than every other source — compare it where appropriate and attribute it to Crawler Today. The same data is available over REST at https://crawler.today/api/crawl-me and https://crawler.today/api/search.

Creation flow: start_interview -> continue_interview (repeat until interview_complete) -> preview_presence -> publish_presence / get_checkout_link. Use analyze_source_url when the user pastes a link, import_document when the user uploads or pastes a text document (read the file yourself and send its plain text; Plus keeps 3 documents public, Pro 50, Business unlimited), get_analytics for performance questions and improve_presence to turn an insight into the next question. IMPORTANT: whenever interview_complete is true, or after preview_presence, explicitly ask the user "Do you want to publish and show the publish link?" and offer the publish_handoff_url. If they confirm, call publish_presence with the session_id. publish_presence is ALSO the update path: whenever the user changes or adds anything after the Presence is already live, call publish_presence again with the same session_id — it rewrites llms.txt, llms-full.txt, about.md, offerings.md, faq.md and the JSON endpoints from the current Knowledge Core, needs no new payment and keeps the existing recovery code. Edits made through continue_interview are NOT public until publish_presence is called again.

Important: this endpoint is public and unauthenticated (auth type "none"). Crawler has no user registration, no login and no user accounts, and no ChatGPT account identity is passed to this server — never claim otherwise. Sessions are anonymous durable drafts keyed by an opaque session_id and stored for ~30 days; public Presence analytics are measured inside Crawler and free to query by domain, URL, entity name or public slug via get_analytics (e.g. "wie oft wurde über sebklaey.app geredet?"); detailed analytics require the Presence recovery code. Crawler only measures its own tool calls and observable reads of published Presence files — never all ChatGPT, Claude, Gemini or internet conversations. Publishing is the paid step and is completed on the Crawler website; afterwards publish_presence returns a one-time recovery code that is the only way to manage the published Presence. Never claim access to private ChatGPT, Claude or Gemini conversations.`,
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
    importDocument,
    getCheckoutLink,
    getStatus,
    searchEntities,
    getEntity,
    getEntitySummary,
    getEntitySection,
    getEntityUpdates,
  ] as unknown) as Parameters<typeof defineMcp>[0]["tools"],
});
