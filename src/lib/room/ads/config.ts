/**
 * Crawler Ads — central, testable configuration.
 *
 * "Crawler Ads — Resonating with your audience."
 *
 * Everything that decides whether a sponsored card may appear lives here, so
 * thresholds, caps and spacing can be tuned in one place. No value in this
 * file may ever describe a person; only abstract delivery rules.
 */

export const AD_PRODUCT_NAME = "Crawler Ads";
export const AD_PRODUCT_TAGLINE = "Resonating with your audience.";
export const AD_DISCLOSURE_LABEL = "Sponsored · Crawler Ad";

/** Matching weights — must sum to 1. */
export const AD_MATCH_WEIGHTS = {
  dimensions: 0.65,
  intent: 0.15,
  language: 0.1,
  quality: 0.1,
} as const;

/** Below this normalised score (0–1) an ad is never shown. */
export const MINIMUM_RESONANCE_SCORE = 0.72;

/** Feed insertion and frequency rules. */
export const AD_DELIVERY = {
  /** At least this many organic feed items before a sponsored card may appear. */
  minOrganicItemsBeforeAd: 8,
  /** Never more than this many sponsored cards in one feed page. */
  maxAdsPerPage: 1,
  /** Never two sponsored cards without organic content in between. */
  minOrganicItemsBetweenAds: 8,
  /** Personalised resonance ads per anonymous identity per day. */
  maxAdsPerDay: 2,
  /** Same creative at most once inside this window. */
  sameCreativeCooldownHours: 24,
  /** Weekly cap across all creatives. */
  maxAdsPerWeek: 8,
  /** A campaign with fewer organic items in the room shows nothing. */
  minRoomOrganicItems: 8,
} as const;

/** Analytics: never break a segment out below this many events. */
export const MIN_SEGMENT_EVENTS = 20;

/** Statuses a creative can hold. */
export const CREATIVE_STATUSES = [
  "draft",
  "incomplete",
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "scheduled",
  "active",
  "paused",
  "completed",
  "rejected",
  "suspended",
  "cancelled",
] as const;
export type CreativeStatus = (typeof CREATIVE_STATUSES)[number];

/** Only these creative statuses may ever be delivered. */
export const DELIVERABLE_CREATIVE_STATUSES: CreativeStatus[] = ["approved", "scheduled", "active"];

/** Campaign statuses whose creatives may be delivered. */
export const DELIVERABLE_CAMPAIGN_STATUSES = ["approved", "active"];

export const AD_TRANSPARENCY_TEXT =
  "You chose to use an anonymous resonance pattern for matching and recommendations. This ad has an abstract pattern that aligns with parts of yours, such as creative direction, professional interests or preferred conversation style. The advertiser did not select you and cannot see your profile, identity, messages or resonance pattern.";

export const AD_TRANSPARENCY_FACTS = [
  "The advertiser did not select you individually.",
  "The advertiser never sees your session id.",
  "The advertiser never sees your Crawler handle.",
  "The advertiser never sees your messages.",
  "The advertiser never sees your resonance pattern.",
  "Matching happens only on Crawler's servers.",
  "You can hide this ad, block the advertiser or turn resonance ads off.",
];

/** Broad, non-sensitive reason categories shown to a person. */
export const AD_REASON_CATEGORIES = [
  "Creative interests",
  "Technology interests",
  "Professional collaboration",
  "Product discovery",
  "Shared language",
] as const;

export const AD_MATCHING_NOTE = "Matched through an abstract resonance pattern.";
