import { defineMcp } from "@lovable.dev/mcp-js";
import { CRAWLER_MCP_NAME, CRAWLER_MCP_TITLE, CRAWLER_VERSION } from "../version";
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
  name: CRAWLER_MCP_NAME,
  title: CRAWLER_MCP_TITLE,
  version: CRAWLER_VERSION,
  instructions: `Crawler publishes AI-readable public Presences (Knowledge Cores) and hosts anonymous public chat rooms. Routing: to READ about an entity use search_entities, then get_entity / get_entity_summary / get_entity_section / get_entity_updates. To BUILD a Presence use start_interview -> continue_interview -> preview_presence -> publish_presence. For rooms use list_topics -> enter_topic -> send_message / read_messages. For plans and payment use get_pricing, get_my_plan, get_checkout_link. Each tool description states exactly what it does.

Publishing: publish_presence is also the update path — call it again with the same session_id after any change; edits are not public until then. It returns a one-time recovery code (<slug>~<secret>) which is the ONLY way to manage a published Presence.

Identity: this endpoint is public and unauthenticated. Crawler has no accounts, no login and no OAuth, and no ChatGPT identity is passed to it. Three separate capabilities exist: session_id (sess_…, an anonymous ~30-day draft), room_token (an opaque anonymous room identity — the first room call returns one; store it and pass it to every later room tool) and the recovery code (manages a published Presence). Never treat one as another.

Rooms: every Crawler room is publicly readable — there are no private rooms and no private messages. Never promise privacy and never collect real names, emails or other personal data. Topic rooms hold at most 5 people and messages disappear after 24 hours; published Presence data is durable.

Plans (server-enforced): free covers rooms, profiles, search, Sugar and public aggregate analytics. Plus $5/month publishes a Presence and unlocks your personal room, own public rooms, invitations and a custom alias. Pro $20/month adds communities, moderators, Match, Love, pair rooms, custom domain and full analytics. Business $80/month adds organizations, sponsored campaigns, team access, exports and API. When a tool returns PLAN_REQUIRED or LIMIT_REACHED, name the required plan and use upgrade_url from the response. TEMPORARILY_UNAVAILABLE means an outage, not a missing subscription — retry, never ask the user to buy again.

Analytics: Crawler measures only its own tool calls and reads of published Presence files. Never claim access to private ChatGPT, Claude or Gemini conversations. Public aggregate counts are free; detailed analytics need the recovery code.

Sugar: an internal reputation signal with NO monetary value — not a currency, not tradable, never priced. Always preview_sugar_gift and get an explicit yes before send_sugar.

Match / Love (Pro): anonymous abstract patterns only, never profiles or photos, and a pair room appears only when both sides accept. Never collect names, ages, photos, addresses, health, religion, political or sexual data.

Crawler is a digital SaaS by SEBKLAEY Agency (Bern, Switzerland). It publishes text files only and never ships physical goods. Payments run through Paddle on crawler.today; checkout never happens inside the conversation.`,


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
