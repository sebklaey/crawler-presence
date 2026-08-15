/**
 * Crawler Love — configuration.
 *
 * Crawler Love is an OPTIONAL romantic compatibility mode inside the existing
 * match system. It never guarantees a partner: "Schwingungsprofil" / Love
 * Resonance Profile is a product term for an algorithmic compatibility profile,
 * not a medical, psychological or scientific diagnosis.
 *
 * All env values are read lazily inside functions — the Worker runtime injects
 * environment per request.
 */

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function flag(name: string, fallback: boolean): boolean {
  const raw = env(name)?.toLowerCase();
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

function num(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loveConfig() {
  return {
    /** Master kill switch for the whole feature. */
    enabled: flag("CRAWLER_LOVE_ENABLED", true),
    /**
     * Public matching stays OFF until a reliable host-side age signal exists.
     * A self-attestation is never "verified age".
     */
    publicMatchingEnabled: flag("CRAWLER_LOVE_PUBLIC_MATCHING_ENABLED", false),
    minimumAge: num("CRAWLER_LOVE_MINIMUM_AGE", 18),
    /** A declined pair is not proposed again within this window. */
    declineCooldownDays: num("CRAWLER_LOVE_DECLINE_COOLDOWN_DAYS", 90),
    /** An unanswered request expires. */
    requestTtlDays: num("CRAWLER_LOVE_REQUEST_TTL_DAYS", 7),
    /** Unconfirmed interview drafts disappear after this many hours. */
    draftTtlHours: num("CRAWLER_LOVE_DRAFT_TTL_HOURS", 24),
    /** Nothing below this internal score is ever shown. */
    minimumResonance: num("CRAWLER_LOVE_MIN_RESONANCE", 55),
  };
}

/** Only Pro and Business include Crawler Love. */
export const LOVE_ENTITLEMENT = "crawler_love";
export const LOVE_ALLOWED_PLANS = ["pro", "business"] as const;

export const LOVE_CONSENT_VERSION = "love-consent-2026-08";
export const LOVE_VECTOR_VERSION = 1;

export const LOVE_PRICING_URL = "https://crawler.today/pricing";

export const LOVE_INTRO =
  "Crawler Love helps you explore romantic compatibility through a guided interview. Your Love Profile is separate from your general Crawler profile and is only used for mutual matching after your explicit consent.";

export const LOVE_SAFETY_NOTICE =
  "Crawler Love is intended for adults aged 18 and over. Do not share addresses, financial information, passwords, recovery codes or intimate private information.";

export const LOVE_PAIR_ROOM_NOTICE =
  "If both of you accept, Crawler creates a publicly readable Pair Room. Only the two matched users can post in it.";

export const LOVE_NOT_A_DIAGNOSIS =
  "A Love Resonance Profile is an algorithmic compatibility profile, not a medical, psychological or scientific assessment. Crawler Love never guarantees attraction, a relationship or a perfect partner.";

export const LOVE_PLAN_REQUIRED_MESSAGE =
  "Crawler Love is available with Crawler Pro and Business. You can view the feature details on the Crawler pricing page.";

export const LOVE_LANGUAGE_INSTRUCTION =
  "Never use the words 'perfect partner', 'guaranteed love', 'soulmate detected' or 'scientifically proven compatibility'. Use 'strong possible resonance', 'compatible relationship intentions', 'shared values and communication preferences' or 'potential romantic compatibility'.";

/** Weighted mutual compatibility model. Must sum to 1. */
export const LOVE_WEIGHTS = {
  partner_preference_fit: 0.25,
  values: 0.2,
  communication: 0.15,
  closeness: 0.15,
  conflict: 0.1,
  rhythm: 0.1,
  interests: 0.05,
} as const;

/** Deliberately soft, never a score. */
export function loveResonanceLabel(score: number): string {
  if (score >= 82) return "Strong possible resonance";
  if (score >= 68) return "Good possible resonance";
  return "Some possible resonance";
}

export type AdultStatus = "unknown" | "self_attested" | "verified";

/** Self-attestation counts only while public matching is disabled (internal/test). */
export function adultStatusEligible(status: AdultStatus): boolean {
  if (status === "verified") return true;
  if (status === "self_attested") return !loveConfig().publicMatchingEnabled;
  return false;
}
