/**
 * PLAN_DEFINITIONS — THE single, server-authoritative, typed source of truth
 * for everything a Crawler subscription unlocks.
 *
 * Nothing else in the codebase may declare a tool→plan mapping, a feature→plan
 * mapping, a numeric limit or a price. `catalog.ts` and `features.ts` are thin
 * projections of this file, the room library derives its limits from it, and
 * the public UI reads the generated projection `publicPlanProjection()`.
 *
 * Hierarchy is strict and cumulative: free(0) < plus(1) < pro(2) < business(3).
 * `admin` is a separate role, never implied by Business and never purchasable.
 */

export type CustomerPlan = "free" | "plus" | "pro" | "business";
export type EntitlementPlan = CustomerPlan | "admin";

export const PLAN_ORDER: CustomerPlan[] = ["free", "plus", "pro", "business"];

export type PlanDefinition = {
  id: CustomerPlan;
  rank: number;
  name: string;
  /** USD per month. */
  price: number;
  headline: string;
  benefits: string[];
  /** Tools introduced by this plan (inherited by every higher plan). */
  tools: string[];
  /** Feature keys introduced by this plan (inherited by every higher plan). */
  features: string[];
  /** Numeric limits. Higher plans override with the more generous value. */
  limits: Record<string, number>;
};

/* -------------------------------------------------------------------------- */
/*  free                                                                       */
/* -------------------------------------------------------------------------- */

const FREE_TOOLS = [
  // Knowledge Core
  "start_interview",
  "continue_interview",
  "analyze_source_url",
  "get_knowledge_core",
  "preview_presence",
  "import_document",
  "delete_document",
  // Public entity retrieval
  "search_entities",
  "get_entity",
  "get_entity_summary",
  "get_entity_section",
  "get_entity_updates",
  // Universal + topic rooms
  "enter_universal",
  "list_universal",
  "send_universal_message",
  "list_topics",
  "enter_topic",
  "read_messages",
  "send_message",
  "leave_topic",
  "my_rooms",
  // Images
  "create_image_upload",
  "finalize_image_upload",
  "submit_image_review",
  "get_image",
  // Profile
  "get_profile",
  "update_profile",
  "change_handle",
  "set_profile_image",
  "open_profile_link",
  "block_profile",
  "like_content",
  "unlike_content",
  // Rooms of other people
  "open_room",
  "send_room_message",
  "leave_room",
  "follow_room",
  "unfollow_room",
  "following_rooms",
  "join_invitation",
  // Social profiles
  "list_social_providers",
  "resolve_social_profile",
  "preview_social_profile",
  "post_social_profile_to_room",
  // Safety and notifications
  "report_message",
  "report_sponsored_placement",
  "hide_sponsored_placement",
  "block_advertiser",
  "set_resonance_ads_preference",
  "notification_settings",
  "room_notifications",
  // Crawler Sugar
  "get_my_sugar",
  "start_sugar_mining",
  "preview_sugar_gift",
  "send_sugar",
  "get_public_sugar",
  "list_my_sugar_activity",
  // System, pricing, billing
  "get_pricing",
  "get_my_plan",
  "get_checkout_link",
  "get_status",
  "get_analytics",
  // Love data a downgraded user must keep reaching
  "get_love_interview_status",
  "review_love_profile",
  "list_love_match_requests",
  "pause_love_profile",
  "delete_love_profile",
];

/* -------------------------------------------------------------------------- */

export const PLAN_DEFINITIONS: Record<CustomerPlan, PlanDefinition> = {
  free: {
    id: "free",
    rank: 0,
    name: "Free",
    price: 0,
    headline: "Discover, talk and build for free.",
    benefits: [
      "Optional public Crawler profile",
      "Universal Room and topic rooms",
      "Text and reviewed image posts",
      "Share social profiles",
      "Build a Knowledge Core",
      "Full preview of all AI files",
      "Search and read public Presences",
      "Crawler Sugar: mine, gift and show reputation",
    ],
    tools: FREE_TOOLS,
    features: [],
    limits: {
      presences: 0,
      content_records: 0,
      documents: 0,
      analytics_days: 0,
      owned_rooms: 0,
      communities: 0,
      community_members: 0,
      room_members: 0,
    },
  },

  plus: {
    id: "plus",
    rank: 1,
    name: "Plus",
    price: 5,
    headline: "Publish your Presence and own your room.",
    benefits: [
      "1 published Presence",
      "10 content records, 3 documents",
      "7-day analytics",
      "Your personal public room + more public rooms",
      "Invitations, profile and room statistics",
      "Custom alias",
      "Monthly source check",
    ],
    tools: [
      "publish_presence",
      "my_room",
      "create_public_room",
      "update_my_room",
      "manage_room",
      "create_invitation",
      "profile_analytics",
      "set_alias",
      "get_alias",
    ],
    features: [
      "personal_room",
      "own_public_rooms",
      "invitations",
      "custom_alias",
      "delete_own",
      "favorites",
      "pin",
      "ad_free_owned",
      "profile_analytics",
    ],
    limits: {
      presences: 1,
      content_records: 10,
      documents: 3,
      analytics_days: 7,
      owned_rooms: 3,
      communities: 0,
      community_members: 0,
      room_members: 50,
    },
  },

  pro: {
    id: "pro",
    rank: 2,
    name: "Pro",
    price: 20,
    headline: "Match, grow and build a community.",
    benefits: [
      "Crawler Match with anonymous resonance patterns",
      "Crawler Love: guided compatibility interview and mutual matching",
      "Public Pair Rooms",
      "200 content records, 50 documents",
      "90-day analytics, insights and improvement recommendations",
      "Custom domain, community rooms and moderators",
      "Weekly source check",
    ],
    tools: [
      "create_resonance_pattern",
      "update_resonance_pattern",
      "delete_resonance_pattern",
      "find_match",
      "get_match_status",
      "respond_to_match",
      "open_pair_room",
      "send_pair_message",
      "close_pair_room",
      "improve_presence",
      "start_love_interview",
      "answer_love_interview_question",
      "activate_love_profile",
      "find_love_candidate",
      "send_love_match_request",
      "respond_to_love_match",
    ],
    features: [
      "communities",
      "moderators",
      "match",
      "pair_rooms",
      "love",
      "polls",
      "events",
      "search",
      "summaries",
      "analytics",
      "room_analytics",
      "paid_rooms",
      "custom_domain",
    ],
    limits: {
      presences: 5,
      content_records: 200,
      documents: 50,
      analytics_days: 90,
      owned_rooms: 25,
      // The documented and currently active Pro allowance.
      communities: 10,
      community_members: 250,
      room_members: 250,
    },
  },

  business: {
    id: "business",
    rank: 3,
    name: "Business",
    price: 80,
    headline: "Operate organizations, campaigns and data at scale.",
    benefits: [
      "5,000 content records, unlimited documents",
      "Everything in Pro, including Crawler Love",
      "Organizations and shared team access",
      "Sponsored campaigns and campaign analytics",
      "REST API and scheduled reports",
      "Daily source check and priority support",
    ],
    tools: [
      "create_sponsored_campaign",
      "add_campaign_creative",
      "preview_sponsored_campaign",
      "manage_campaign",
      "submit_campaign_for_review",
      "get_campaign_analytics",
    ],
    features: [
      "organizations",
      "campaigns",
      "sponsored_campaigns",
      "api_access",
      "export",
      "exports",
      "audit_logs",
      "branding",
      "translation",
      "sso",
      "team_access",
      "scheduled_reports",
    ],
    limits: {
      presences: 50,
      content_records: 5000,
      documents: 100000,
      analytics_days: 365,
      owned_rooms: 250,
      communities: 100,
      community_members: 5000,
      room_members: 5000,
    },
  },
};

/** Tools reserved for internal platform administration. Never purchasable. */
export const ADMIN_TOOLS = ["admin_review_campaign"];

/* ----------------------------- derived indexes ---------------------------- */

function buildToolIndex(): Record<string, EntitlementPlan> {
  const index: Record<string, EntitlementPlan> = {};
  for (const plan of PLAN_ORDER) {
    for (const tool of PLAN_DEFINITIONS[plan].tools) {
      if (index[tool]) {
        throw new Error(`CONFIG: tool "${tool}" is mapped to more than one plan`);
      }
      index[tool] = plan;
    }
  }
  for (const tool of ADMIN_TOOLS) {
    if (index[tool]) throw new Error(`CONFIG: admin tool "${tool}" is also mapped to a plan`);
    index[tool] = "admin";
  }
  return index;
}

function buildFeatureIndex(): Record<string, CustomerPlan> {
  const index: Record<string, CustomerPlan> = {};
  for (const plan of PLAN_ORDER) {
    for (const feature of PLAN_DEFINITIONS[plan].features) {
      if (index[feature]) throw new Error(`CONFIG: feature "${feature}" is mapped twice`);
      index[feature] = plan;
    }
  }
  return index;
}

/** tool name → minimum plan (or "admin"). Exactly one entry per tool. */
export const TOOL_PLAN_INDEX: Record<string, EntitlementPlan> = buildToolIndex();

/** feature key → minimum plan. Exactly one entry per feature. */
export const FEATURE_PLAN_INDEX: Record<string, CustomerPlan> = buildFeatureIndex();

/** Historic feature aliases kept working without duplicating the source. */
export const FEATURE_ALIASES: Record<string, string> = {
  // All Crawler rooms are public; the old key survives in stored data.
  private_rooms: "own_public_rooms",
};

export function resolveFeatureKey(key: string): string {
  return FEATURE_ALIASES[key] ?? key;
}

export const isKnownTool = (tool: string): boolean =>
  Object.prototype.hasOwnProperty.call(TOOL_PLAN_INDEX, tool);

export const isKnownFeature = (feature: string): boolean =>
  Object.prototype.hasOwnProperty.call(FEATURE_PLAN_INDEX, resolveFeatureKey(feature));

/** Cumulative limits for a plan (higher plan always ≥ lower plan). */
export function limitsFor(plan: CustomerPlan): Record<string, number> {
  const out: Record<string, number> = {};
  for (const candidate of PLAN_ORDER) {
    if (PLAN_DEFINITIONS[candidate].rank > PLAN_DEFINITIONS[plan].rank) break;
    for (const [key, value] of Object.entries(PLAN_DEFINITIONS[candidate].limits)) {
      out[key] = Math.max(out[key] ?? 0, value);
    }
  }
  return out;
}

/** Every tool a plan may call (cumulative, admin tools excluded). */
export function toolsFor(plan: CustomerPlan): string[] {
  const out: string[] = [];
  for (const candidate of PLAN_ORDER) {
    if (PLAN_DEFINITIONS[candidate].rank > PLAN_DEFINITIONS[plan].rank) break;
    out.push(...PLAN_DEFINITIONS[candidate].tools);
  }
  return out;
}

/** Serializable projection safe to ship to the browser / pricing page. */
export function publicPlanProjection() {
  return PLAN_ORDER.map((plan) => ({
    id: plan,
    name: PLAN_DEFINITIONS[plan].name,
    price: PLAN_DEFINITIONS[plan].price,
    headline: PLAN_DEFINITIONS[plan].headline,
    benefits: PLAN_DEFINITIONS[plan].benefits,
    limits: limitsFor(plan),
    tools: toolsFor(plan),
  }));
}
