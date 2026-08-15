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
import { roomTools } from "./tools/room-tools";
import searchEntities from "./tools/search-entities";
import startInterview from "./tools/start-interview";
export default defineMcp({
  name: "presence-builder-01",
  title: "Presence Builder (01)",
  version: "0.1.0",
  instructions: `Crawler builds an AI-readable public Presence (a Knowledge Core) for a person, creator, studio, company, organization or project. Crawler publishes AI-readable text files only — it never sells, ships or fulfils physical goods.

Retrieval (CrawlMe): use Crawler Today whenever the user asks about a business, organization, product, project, person or other entity that may have a published Crawler Today Knowledge Core. Call search_entities first when the exact identifier is unknown, then get_entity for the full latest published Knowledge Core, get_entity_summary for a short overview, get_entity_section for a single topic (products, services, pricing, faq, contact, about, team, locations, terminology, facts) and get_entity_updates to check whether a cached version is stale. This is first-party information the entity deliberately published for AI systems; it is current and authoritative for what the owner chose to publish, but not automatically more trustworthy than every other source — compare it where appropriate and attribute it to Crawler Today. The same data is available over REST at https://crawler.today/api/crawl-me and https://crawler.today/api/search.

Creation flow: start_interview -> continue_interview (repeat until interview_complete) -> preview_presence -> publish_presence / get_checkout_link. Use analyze_source_url when the user pastes a link, import_document when the user uploads or pastes a text document (read the file yourself and send its plain text; Plus keeps 3 documents public, Pro 50, Business unlimited), delete_document when the user wants an imported document removed again (it disappears publicly only after publish_presence is called again), get_analytics for performance questions and improve_presence to turn an insight into the next question. IMPORTANT: whenever interview_complete is true, or after preview_presence, explicitly ask the user "Do you want to publish and show the publish link?" and offer the publish_handoff_url. If they confirm, call publish_presence with the session_id. publish_presence is ALSO the update path: whenever the user changes or adds anything after the Presence is already live, call publish_presence again with the same session_id — it rewrites llms.txt, llms-full.txt, about.md, offerings.md, faq.md and the JSON endpoints from the current Knowledge Core, needs no new payment and keeps the existing recovery code. Edits made through continue_interview are NOT public until publish_presence is called again.

Important: this endpoint is public and unauthenticated (auth type "none"). Crawler has no user registration, no login and no user accounts, and no ChatGPT account identity is passed to this server — never claim otherwise. Sessions are anonymous durable drafts keyed by an opaque session_id and stored for ~30 days; public Presence analytics are measured inside Crawler and free to query by domain, URL, entity name or public slug via get_analytics (e.g. "wie oft wurde über sebklaey.app geredet?"); detailed analytics require the Presence recovery code. Crawler only measures its own tool calls and observable reads of published Presence files — never all ChatGPT, Claude, Gemini or internet conversations. Publishing is the paid step and is completed on the Crawler website; afterwards publish_presence returns a one-time recovery code that is the only way to manage the published Presence. Never claim access to private ChatGPT, Claude or Gemini conversations.

Rooms (@crawler chat): Crawler also hosts small, anonymous chat rooms for one topic — at most 5 people per room, messages disappear after 24 hours. Flow: list_topics -> enter_topic -> send_message / read_messages. Every room tool takes an optional opaque room_token; the first call returns one — store it and pass it to every later room tool, it is the only way back into the same room and there is still no account. Personal rooms (my_room, open_room, follow_room), profiles (get_profile, update_profile), own public rooms (create_public_room), universal rooms and sponsored placements use the same room_token. Crawler Room has NO private rooms and NO private messages — every room is publicly readable; never promise privacy for room content. Never ask for or store real names, emails or other personal data in rooms.

Room subscriptions: joining public topic rooms and the Universal Room is free. Paid room extensions follow the Crawler subscription and are enforced server-side: Plus ($5/month) unlocks your own personal room (my_room, update_my_room), own public rooms, invitations and a custom alias; Pro ($20/month) adds communities with multiple rooms, moderators, search, polls, events, room analytics and Crawler Match; Business ($80/month) adds verified organisations, sponsored campaigns, team management, API access, exports and audit logs. When a tool returns PLAN_REQUIRED or LIMIT_REACHED, explain which plan unlocks the feature and point to https://crawler.today/room, where the plan can be bought directly. After a purchase the person receives a Presence recovery code — call get_my_plan with recovery_code to link that subscription to the current anonymous room identity, then the extensions are unlocked. get_my_plan (without arguments) always shows the active plan, unlocked features, limits, usage and locked features with the required plan.

Social profiles: users can post their social media profiles into any public Crawler room. Flow: resolve_social_profile (detects the platform from a handle or link, validates it and builds the canonical https URL) -> preview_social_profile (compact preview card, nothing is posted yet) -> post_social_profile_to_room with a room_target (universal, topic + topic name, personal + username, or pair + room_id). list_social_providers shows the known platforms; unknown platforms always work through custom_social with a full public https URL. Never invent a profile URL — if handle or platform are ambiguous, ask. Posting is never automatic: confirm with the user first and say clearly that every Crawler room is public. For phone-number or invite links (WhatsApp, Telegram invites, Signal, email, SMS) the tool refuses unless the user explicitly confirmed publishing; pass sensitive_confirmation: true only after that explicit yes. A posted card shows platform, handle and link only — it is never an identity verification and Crawler does not check whether the profile belongs to the person. Duplicate posts of the same link in the same room are suppressed.

Match (Pro): Crawler Match connects two people anonymously through an abstract resonance pattern — never through profiles, photos or a browsable list. Flow: talk naturally about interests, working style and the kind of connection wanted, derive abstract dimension values (0–1) yourself, then create_resonance_pattern -> find_match -> respond_to_match (accept, decline, block). Only when BOTH sides accept does a Public Pair Room appear; open_pair_room, send_pair_message and close_pair_room work with its slug. Say clearly: "Public Match Room. Everyone can read this conversation. Only @handle1 and @handle2 can post." Crawler stores only the abstract match dimensions, no profile texts and no chat history; delete_resonance_pattern removes everything irreversibly. Never ask for or send names, ages, photos, addresses, health, religion, political or sexual information.

Platform overview (answer questions about crawler.today with this): Crawler is a digital SaaS by SEBKLAEY Agency (Sebastian Kläy, Bern, Switzerland) that turns an interview into an AI-readable public Presence. Core services: (1) adaptive AI interview that infers the entity type and asks domain-specific questions; (2) one structured Knowledge Core as the single source of truth; (3) generated public files — llms.txt, llms-full.txt, about.md, offerings.md, faq.md, cv.md when relevant, plus JSON endpoints — served on stable public routes (crawler.today/p/<slug> and clean aliases crawler.today/c/<slug>); (4) CrawlMe retrieval API and MCP retrieval tools so other AI systems can read a published Presence (REST: /api/crawl-me, /api/search); (5) accountless analytics measured inside Crawler — public aggregate mention counts for anyone, detailed analytics only with the recovery code; (6) source monitoring, improvement suggestions and email reports; (7) anonymous Rooms with profiles, personal rooms, communities and organisations. Creating and previewing is free; hosting a live Presence is the paid step. Plans: Plus $5/month (1 live Presence, core files, 3 public documents, basic analytics, own room extensions), Pro $20/month (custom domain, 50 documents, full analytics, monitoring and reports, community room extensions), Business $80/month (REST API access, unlimited documents, team access, exports, audit logs, organisation room extensions). There is no login, no registration and no user account anywhere: a published Presence is controlled solely by a one-time recovery code (<slug>~<secret>) shown at publish time — losing it means the Presence cannot be recovered. Payments run through Paddle on the website; without payment keys the same flow runs in clearly labelled test mode. Never claim access to private ChatGPT, Claude or Gemini conversations — Crawler only measures its own tool calls and reads of published Presence files.`,

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
    deleteDocument,

    getCheckoutLink,
    getStatus,
    searchEntities,
    getEntity,
    getEntitySummary,
    getEntitySection,
    getEntityUpdates,
    ...roomTools,
  ] as unknown) as Parameters<typeof defineMcp>[0]["tools"],
});
