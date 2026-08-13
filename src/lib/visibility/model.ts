/**
 * AI Visibility Analytics — shared, client-safe model.
 *
 * Every number this module can produce carries its source, its window and its
 * definition. Crawler measures only what it can actually observe: its own tool
 * calls, reads of the published Presence files, explicitly connected sources
 * and controlled benchmark runs. Private conversations inside ChatGPT, Claude,
 * Gemini or any other external assistant are never queried, never simulated
 * and never presented as measurable.
 */

export type SourceType =
  | "crawler_internal"
  | "presence_read"
  | "authorized_ai"
  | "public_web"
  | "search_console"
  | "visibility_benchmark"
  | "user_reported"
  | "ai_retrieval";

export type EventType =
  | "mention"
  | "file_read"
  | "outbound_click"
  | "impression"
  | "click"
  | "citation"
  | "api_request"
  | "mcp_retrieval";

export type MetricStatus = "live" | "delayed" | "demo" | "not_connected";

export type Period = 7 | 30 | 90 | "all";

export const PERIODS: { value: Period; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: "all", label: "All time" },
];

export const SCOPE_NOTICE =
  "These analytics show only events Crawler can measure inside connected or publicly observable sources. They do not cover every conversation on the internet, and never private conversations in ChatGPT, Claude, Gemini or any other external assistant.";

export const SOURCE_LABELS: Record<SourceType, { label: string; definition: string }> = {
  crawler_internal: {
    label: "Crawler internal",
    definition: "Crawler tool calls whose arguments referenced this Presence.",
  },
  presence_read: {
    label: "Presence file reads",
    definition: "Requests for llms.txt, llms-full.txt, Markdown or JSON files of this Presence.",
  },
  authorized_ai: {
    label: "Authorized AI projects",
    definition: "Interactions from explicitly connected API projects (Business API).",
  },
  public_web: {
    label: "Public web",
    definition: "Mentions on publicly accessible websites with a reachable URL.",
  },
  search_console: {
    label: "Google Search Console",
    definition: "Impressions and clicks from a connected Search Console property.",
  },
  visibility_benchmark: {
    label: "Visibility benchmark",
    definition: "Controlled test questions sent to selected AI models — not a measurement of real users.",
  },
  user_reported: {
    label: "Self-reported",
    definition: "Mentions you reported yourself. Not verified by Crawler.",
  },
  ai_retrieval: {
    label: "AI retrieval",
    definition:
      "An AI system or client fetched the published Knowledge Core through the CrawlMe API or MCP. A retrieval is not a mention.",
  },
};

export const EVENT_LABELS: Record<EventType, string> = {
  mention: "Observed mention",
  file_read: "File read",
  outbound_click: "Outbound click",
  impression: "Impression",
  click: "Click",
  citation: "Citation",
  api_request: "CrawlMe API request",
  mcp_retrieval: "MCP retrieval",
};

export type Kpi = {
  key: string;
  label: string;
  value: number;
  previous: number;
  delta: number | null;
  unit?: "score";
  source: SourceType | "computed";
  sourceLabel: string;
  definition: string;
  status: MetricStatus;
};

export type SeriesPoint = { date: string; mentions: number; reads: number };

export type MentionRow = {
  occurredAt: string;
  source: SourceType;
  entity: string | null;
  mentionType: EventType;
  publicUrl: string | null;
  confidence: number | null;
};

export type ReadRow = {
  path: string;
  reads: number;
  uniqueSessions: number;
  referrer: string;
  client: string;
};

export type BenchmarkRow = {
  testedAt: string;
  provider: string;
  model: string;
  prompt: string;
  promptVersion: string;
  mentioned: boolean;
  descriptionCorrect: boolean | null;
  sourceCited: boolean;
  position: number | null;
  issues: string[];
  summary: string | null;
};

export type AdapterState = {
  type: SourceType;
  label: string;
  definition: string;
  status: MetricStatus;
  lastSyncedAt: string | null;
  measured: string;
  notMeasured: string;
  connectHint: string | null;
  /** Whether this source can be connected or disconnected from the dashboard. */
  connectable: boolean;
  /** Label for the optional configuration field shown in the connect form. */
  configLabel: string | null;
  /** Current configuration value, if any (never a secret). */
  configValue: string | null;
};

export type VisibilityDashboard = {
  slug: string;
  plan: string;
  period: Period;
  windowLabel: string;
  dataSince: string | null;
  demo: boolean;
  kpis: Kpi[];
  series: SeriesPoint[];
  sourceBreakdown: { source: SourceType; label: string; count: number }[];
  mentions: MentionRow[];
  reads: ReadRow[];
  benchmarks: BenchmarkRow[];
  benchmarkSummary: { runs: number; mentionRate: number | null; correctRate: number | null; citedRate: number | null };
  adapters: AdapterState[];
  insights: string[];
  scopeNotice: string;
};

export type PublicVisibility = {
  slug: string;
  period: Period;
  distinctSessions: number;
  mentionEvents: number;
  presenceReads: number;
  dataSince: string | null;
  scopeNotice: string;
};

/** Hide small groups: values below this threshold are not reported. */
export const MIN_GROUP_SIZE = 3;

export function periodLabel(period: Period): string {
  return period === "all" ? "all time" : `last ${period} days`;
}
