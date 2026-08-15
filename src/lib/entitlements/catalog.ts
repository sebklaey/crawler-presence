/**
 * Central entitlement catalogue — the single source of truth for which Crawler
 * tool needs which subscription.
 *
 * Nothing else in the codebase may hardcode a plan price or a tool→plan
 * mapping. Prices come from `src/lib/billing.ts` (paid plans) and are extended
 * here with the free tier and the non-purchasable admin tier.
 */
import { PLANS } from "../billing";

export type CustomerPlan = "free" | "plus" | "pro" | "business";
export type EntitlementPlan = CustomerPlan | "admin";

/** free < plus < pro < business. `admin` is separate and never purchasable. */
export const PLAN_ORDER: CustomerPlan[] = ["free", "plus", "pro", "business"];

export const planRank = (plan: string): number => {
  const index = PLAN_ORDER.indexOf(plan as CustomerPlan);
  return index < 0 ? 0 : index;
};

export const meetsPlan = (current: string, required: CustomerPlan): boolean =>
  planRank(current) >= planRank(required);

export type PlanInfo = {
  id: EntitlementPlan;
  name: string;
  /** USD per month. 0 for free, null for admin (not purchasable). */
  price: number | null;
  headline: string;
  benefits: string[];
};

const paid = (id: "plus" | "pro" | "business") => PLANS.find((p) => p.id === id)!;

export const PLAN_INFO: Record<EntitlementPlan, PlanInfo> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    headline: "Discover, talk and build for free.",
    benefits: [
      "Public Crawler profile",
      "Universal Room and topic rooms",
      "Text and image posts",
      "Share social profiles",
      "Build a Knowledge Core",
      "Full preview of all AI files",
      "Search and read public Presences",
    ],
  },
  plus: {
    id: "plus",
    name: "Plus",
    price: paid("plus").price,
    headline: "Publish your Presence and own your room.",
    benefits: [
      "1 published Presence",
      "10 content records, 3 documents",
      "7-day analytics",
      "Your personal public room + 2 more public rooms",
      "Invitations, profile and room statistics",
      "Monthly source check",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: paid("pro").price,
    headline: "Match, grow and build a community.",
    benefits: [
      "Crawler Match with anonymous resonance patterns",
      "Public Pair Rooms",
      "200 content records, 50 documents",
      "90-day analytics, insights and improvement recommendations",
      "Custom domain, community rooms and moderators",
      "Weekly source check",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    price: paid("business").price,
    headline: "Operate organizations, campaigns and data at scale.",
    benefits: [
      "5,000 content records, unlimited documents",
      "Organizations and shared team access",
      "Sponsored campaigns and campaign analytics",
      "REST API and scheduled reports",
      "Daily source check and priority support",
    ],
  },
  admin: {
    id: "admin",
    name: "Platform admin",
    price: null,
    headline: "Internal Crawler platform administration.",
    benefits: [],
  },
};

/**
 * Every Crawler MCP tool and the minimum plan required to call it.
 * Tools mapped to "free" stay reachable without any subscription; a few of them
 * return plan-dependent depth (see PLAN_DEPENDENT_TOOLS).
 */
export const TOOL_PLANS: Record<string, EntitlementPlan> = {
  /* ---------------------------------- free --------------------------------- */
  // Knowledge Core
  start_interview: "free",
  continue_interview: "free",
  analyze_source_url: "free",
  get_knowledge_core: "free",
  preview_presence: "free",
  import_document: "free",
  delete_document: "free",
  // Public entity retrieval
  search_entities: "free",
  get_entity: "free",
  get_entity_summary: "free",
  get_entity_section: "free",
  get_entity_updates: "free",
  // Universal + topic rooms
  enter_universal: "free",
  list_universal: "free",
  send_universal_message: "free",
  list_topics: "free",
  enter_topic: "free",
  read_messages: "free",
  send_message: "free",
  leave_topic: "free",
  my_rooms: "free",
  // Images in free rooms
  create_image_upload: "free",
  finalize_image_upload: "free",
  submit_image_review: "free",
  get_image: "free",
  // Social profile
  get_profile: "free",
  update_profile: "free",
  change_handle: "free",
  set_profile_image: "free",
  set_alias: "free",
  get_alias: "free",
  open_profile_link: "free",
  block_profile: "free",
  like_content: "free",
  unlike_content: "free",
  // Public rooms of other people
  open_room: "free",
  send_room_message: "free",
  leave_room: "free",
  follow_room: "free",
  unfollow_room: "free",
  following_rooms: "free",
  join_invitation: "free",
  // Social media profiles
  list_social_providers: "free",
  resolve_social_profile: "free",
  preview_social_profile: "free",
  post_social_profile_to_room: "free",
  // Safety and notifications
  report_message: "free",
  report_sponsored_placement: "free",
  hide_sponsored_placement: "free",
  block_advertiser: "free",
  set_resonance_ads_preference: "free",
  notification_settings: "free",
  room_notifications: "free",
  // System and pricing
  get_pricing: "free",
  get_my_plan: "free",
  get_checkout_link: "free",
  get_status: "free",
  get_analytics: "free",

  /* ---------------------------------- plus --------------------------------- */
  publish_presence: "plus",
  my_room: "plus",
  create_public_room: "plus",
  update_my_room: "plus",
  manage_room: "plus",
  create_invitation: "plus",
  profile_analytics: "plus",

  /* ----------------------------------- pro --------------------------------- */
  create_resonance_pattern: "pro",
  update_resonance_pattern: "pro",
  delete_resonance_pattern: "pro",
  find_match: "pro",
  get_match_status: "pro",
  respond_to_match: "pro",
  open_pair_room: "pro",
  send_pair_message: "pro",
  close_pair_room: "pro",
  improve_presence: "pro",

  /* -------------------------------- business ------------------------------- */
  create_sponsored_campaign: "business",
  add_campaign_creative: "business",
  preview_sponsored_campaign: "business",
  manage_campaign: "business",
  submit_campaign_for_review: "business",
  get_campaign_analytics: "business",

  /* ---------------------------------- admin -------------------------------- */
  admin_review_campaign: "admin",
};

/** Tools that stay callable on every plan but return plan-dependent depth. */
export const PLAN_DEPENDENT_TOOLS = [
  "get_analytics",
  "import_document",
  "create_image_upload",
  "post_social_profile_to_room",
  "create_public_room",
  "publish_presence",
] as const;

/** Minimum plan for a tool; unknown tools default to free. */
export function requiredPlanForTool(tool: string): EntitlementPlan {
  return TOOL_PLANS[tool] ?? "free";
}

/** Cheapest customer plan that unlocks a tool, or null for admin-only tools. */
export function upgradeTargetForTool(tool: string): CustomerPlan | null {
  const required = requiredPlanForTool(tool);
  return required === "admin" ? null : required;
}
