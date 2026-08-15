/**
 * Central, testable configuration for Crawler Match.
 *
 * Everything here is abstract: dimension keys, allowed intents and connection
 * modes, weights and lifetimes. No free text and no personal categories.
 */

/** The only dimension keys Crawler ever stores. */
export const DIMENSION_KEYS = [
  "creative",
  "technical",
  "entrepreneurial",
  "social",
  "reflective",
  "experimental",
  "structured",
  "spontaneous",
  "local_orientation",
  "global_orientation",
  "collaboration_intensity",
  "conversation_depth",
] as const;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];
export type Dimensions = Partial<Record<DimensionKey, number>>;

/** Allowed high-level intents (no sensitive categories). */
export const INTENTS = [
  "creative_collaboration",
  "professional_exchange",
  "learning",
  "building_something",
  "thinking_together",
  "casual_exchange",
] as const;

/** Allowed connection modes. */
export const CONNECTION_MODES = [
  "ideas",
  "creative collaboration",
  "professional exchange",
  "learning",
  "building",
  "conversation",
] as const;

/** Scoring weights — must sum to 1. Centrally configurable. */
export const MATCH_WEIGHTS = {
  dimensions: 0.55,
  intent: 0.2,
  language: 0.15,
  region: 0.1,
} as const;

/** A candidate below this resonance is never proposed. */
export const MIN_RESONANCE = 55;

/** Default lifetime of a resonance pattern. */
export const DEFAULT_EXPIRY_DAYS = 30;
export const MAX_EXPIRY_DAYS = 90;

/** A declined pair is not re-proposed within this window. */
export const DECLINE_COOLDOWN_DAYS = 30;

/** A match proposal expires if nobody answers. */
export const REQUEST_TTL_DAYS = 7;

export function resonanceLabel(score: number): string {
  if (score >= 85) return "Strong resonance";
  if (score >= 70) return "Clear resonance";
  return "Gentle resonance";
}
