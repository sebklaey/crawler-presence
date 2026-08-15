/**
 * Crawler Sugar — configuration.
 *
 * Sugar is a free, internal social-reputation unit. It has NO monetary value,
 * is not a cryptocurrency, is never tradable and can never leave Crawler.
 * "Mining" is a server-side metaphor for active, human usage.
 *
 * All values are read lazily inside functions, never at module scope, because
 * the Worker runtime injects env per request.
 */

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function num(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Global maximum of Sugar that can exist at the same time. */
export const MAX_SUPPLY = 10_000_000;

/** Gifts always move in steps of ten. */
export const TRANSFER_STEP = 10;

/** 70 % of every gift is burned; the recipient keeps 30 %. */
export const BURN_PERCENT = 70;
export const RECIPIENT_PERCENT = 30;

export const NO_VALUE_NOTICE =
  "Crawler Sugar is a free internal appreciation signal. It has no monetary value, is not a cryptocurrency, cannot be bought, sold, withdrawn or exchanged, and only works inside Crawler.";

export function sugarConfig() {
  return {
    /** Length of one server-side mining lease. */
    leaseSeconds: num("SUGAR_LEASE_SECONDS", 300),
    /** Maximum activity credited between two calls (anti-idle). */
    activityWindowSeconds: num("SUGAR_ACTIVITY_WINDOW_SECONDS", 300),
    /** Minutes of qualified activity for one Sugar. */
    minutesPerUnit: num("SUGAR_MINUTES_PER_UNIT", 5),
    /** Maximum Sugar one account can mine per 24 hours. */
    dailyCap: num("SUGAR_DAILY_CAP", 200),
    /** Anti-farming: an identity must exist this long before it can mine. */
    minimumAccountAgeHours: num("SUGAR_MIN_AGE_HOURS", 24),
  };
}

/** HMAC key for the ledger's server signature. Server-only, read lazily. */
export function sugarSigningKey(): string {
  return (
    env("SUGAR_SIGNING_KEY") ??
    env("SUBJECT_HASH_SECRET") ??
    env("SUPABASE_SERVICE_ROLE_KEY") ??
    "crawler-sugar-fallback"
  );
}
