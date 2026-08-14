/**
 * AI Analytics — client-safe model.
 *
 * Crawler never has access to private conversations in ChatGPT, Claude,
 * Gemini, Perplexity or any other assistant. Every number in this model
 * therefore carries an explicit evidence type, and the four categories are
 * never summed into a pretended "total AI mentions".
 */

export type EvidenceType = "observed" | "attributed" | "synthetic" | "not_measurable";

export const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  observed: "Observed",
  attributed: "Attributed",
  synthetic: "Sample",
  not_measurable: "Not measurable",
};

export const EVIDENCE_DEFINITION: Record<EvidenceType, string> = {
  observed:
    "Events Crawler saw itself: requests for your published Presence files, CrawlMe API calls, Crawler tool calls and trackable outbound clicks.",
  attributed:
    "Traffic Crawler can attribute to an AI surface through the referrer of the visit, plus data from a connected Search Console property. Only visits after a click can be attributed — a mention without a click is invisible here.",
  synthetic:
    "Controlled API test questions sent to selected AI models on a fixed schedule. A sample, never a measurement of real users.",
  not_measurable:
    "Activity no platform exposes to Crawler — above all private conversations inside AI assistants.",
};

export const TRANSPARENCY_NOTICE =
  "No platform gives Crawler access to all private AI conversations. This analysis combines observed events, attributed website traffic and controlled API tests. These categories are never mixed into a supposed total number of all AI mentions.";

export const WHAT_THIS_SHOWS = [
  "Server-side requests for your published Presence files (llms.txt, llms-full.txt, Markdown, JSON) including the detected client and whether it was a verified AI bot.",
  "CrawlMe API and MCP retrievals of your Knowledge Core.",
  "Visits to your published Presence whose referrer is a known AI surface — measured by Crawler itself, no external analytics account needed.",
  "Classic Google search visibility (impressions, clicks, CTR, position) from a connected Search Console property.",
  "Results of controlled, versioned test prompts sent to selected AI APIs.",
];

export const WHAT_IS_NOT_MEASURABLE = [
  "Private conversations in ChatGPT, Claude, Gemini, Perplexity or Copilot. There is no API for them and Crawler never estimates them.",
  "Mentions where the user never clicked a link — no analytics tool can see those.",
  "Whether a bot fetch was later used in an answer. A crawl is not a citation.",
  "Anything a provider does not report: unsupported surfaces stay 'Not connected' instead of showing a fabricated zero.",
];

export type ProviderId = "openai" | "anthropic" | "google" | "perplexity" | "microsoft" | "crawler" | "other";

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  openai: "OpenAI / ChatGPT",
  anthropic: "Claude",
  google: "Gemini",
  perplexity: "Perplexity",
  microsoft: "Bing / Copilot",
  crawler: "Crawler",
  other: "Other",
};

export const PROVIDER_ORDER: ProviderId[] = [
  "openai",
  "anthropic",
  "google",
  "perplexity",
  "crawler",
];

export type SourceType = "crawler_observed" | "server_logs" | "search_console" | "ai_probes";

export const SOURCE_LABEL: Record<SourceType, string> = {
  crawler_observed: "Crawler events",
  server_logs: "Presence server logs",
  search_console: "Google Search Console",
  ai_probes: "AI visibility tests",
};

export type ConnectorStatus = "connected" | "not_connected" | "error" | "stale" | "built_in";

export const CONNECTOR_STATUS_LABEL: Record<ConnectorStatus, string> = {
  connected: "Connected",
  not_connected: "Not connected",
  error: "Error",
  stale: "Stale data",
  built_in: "Built in",
};

export type AnalyticsPeriod = 7 | 30 | 90 | "all";

export const ANALYTICS_PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: "all", label: "All time" },
];

/** Sample sizes below this are flagged as preliminary. */
export const MIN_SAMPLE = 30;

export type MetricCard = {
  key: "observed_citations" | "ai_referral_sessions" | "presence_reads" | "synthetic_visibility";
  label: string;
  /** null = not measurable / source not connected. Never a fabricated 0. */
  value: number | null;
  previous: number | null;
  deltaPct: number | null;
  unit: "count" | "percent";
  evidence: EvidenceType;
  tooltip: string;
  periodLabel: string;
  lastUpdatedAt: string | null;
  status: ConnectorStatus;
  statusHint: string | null;
  /** Sample metrics only. */
  sample?: { n: number; ciLow: number; ciHigh: number; preliminary: boolean } | null;
};

export type SeriesPoint = {
  date: string;
  presence_reads: number;
  verified_ai_fetches: number;
  observed_citations: number;
  ai_referral_sessions: number;
  /** Kept on its own axis/line — never merged into observed events. */
  synthetic_mentions: number;
  synthetic_runs: number;
};

export type SeriesFilters = {
  provider: ProviderId | "all";
  source: SourceType | "all";
  evidence: EvidenceType | "all";
  locale: string | "all";
  region: string | "all";
  eventType: string | "all";
};

export type ProviderRow = {
  provider: ProviderId;
  label: string;
  connection: ConnectorStatus;
  observedFetches: number | null;
  observedCitations: number | null;
  referralSessions: number | null;
  syntheticMentionRate: number | null;
  syntheticCitationRate: number | null;
  syntheticRecommendationRate: number | null;
  sampleSize: number;
  lastSyncedAt: string | null;
};

export type CitationRow = {
  id: string;
  occurredAt: string;
  provider: ProviderId;
  surface: string | null;
  entity: string;
  url: string | null;
  prompt: string | null;
  model: string | null;
  evidence: EvidenceType;
  source: SourceType;
  verified: boolean;
};

export type DataSourceRow = {
  source: SourceType;
  label: string;
  status: ConnectorStatus;
  evidence: EvidenceType;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  recordsImported: number | null;
  error: string | null;
  credentialsPresent: boolean;
  /** Human setup instructions when not connected. Never contains secrets. */
  setupHint: string;
  configLabel: string | null;
  configValue: string | null;
  canSync: boolean;
  /** Providers the user can unlock with their own API key. No secrets here. */
  providerKeys?: { provider: "anthropic" | "perplexity"; label: string; hint: string; url: string; placeholder: string; configured: boolean }[];
};

export type RateSummary = {
  key: "synthetic_mention_rate" | "synthetic_citation_rate" | "synthetic_recommendation_rate" | "share_of_voice";
  label: string;
  rate: number | null;
  n: number;
  ciLow: number | null;
  ciHigh: number | null;
  preliminary: boolean;
  providers: string[];
  models: string[];
  promptVersions: string[];
  windowLabel: string;
};

export type AiAnalyticsDashboard = {
  slug: string;
  name: string;
  plan: string;
  period: AnalyticsPeriod;
  windowLabel: string;
  generatedAt: string;
  cards: MetricCard[];
  series: SeriesPoint[];
  availableFilters: {
    providers: ProviderId[];
    sources: SourceType[];
    evidence: EvidenceType[];
    locales: string[];
    regions: string[];
    eventTypes: string[];
  };
  providers: ProviderRow[];
  citations: CitationRow[];
  rates: RateSummary[];
  dataSources: DataSourceRow[];
  /** True when at least one connected source failed on its last sync. */
  partial: boolean;
  /** Sources whose last successful sync is older than 48h. */
  stale: SourceType[];
  empty: boolean;
  notice: string;
};

/* ------------------------------------------------------------------ */
/* Pure helpers — shared by server aggregation and UI, unit tested.    */
/* ------------------------------------------------------------------ */

/** Wilson score interval (95 %) for a binomial proportion. */
export function wilsonInterval(successes: number, n: number, z = 1.96): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 0 };
  const p = successes / n;
  const denominator = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const low = (centre - margin) / denominator;
  const high = (centre + margin) / denominator;
  return { low: Math.max(0, low), high: Math.min(1, high) };
}

/** Percentage change; null when there is no usable baseline. */
export function deltaPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export function formatRate(rate: number | null): string {
  return rate === null ? "Not measurable" : `${Math.round(rate * 1000) / 10} %`;
}

export function formatCount(value: number | null, status: ConnectorStatus): string {
  if (value !== null) return value.toLocaleString();
  return status === "not_connected" ? "Not connected" : "Not measurable";
}

export function periodDays(period: AnalyticsPeriod): number {
  return period === "all" ? 3650 : period;
}

export function periodLabel(period: AnalyticsPeriod): string {
  return period === "all" ? "All time" : `Last ${period} days`;
}

/** UTC ISO timestamp rendered in the viewer's own timezone. */
export function formatLocal(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
