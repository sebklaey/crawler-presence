/**
 * Insights dashboard — client-safe model.
 *
 * Everything here describes only activity Crawler itself observed: its own
 * tool calls, reads of the published Presence files, CrawlMe API requests and
 * supported outbound clicks. Unknown values stay `null`; they are never
 * replaced with zero. Timestamps are stored in UTC and formatted locally.
 */

export type InsightsPeriod = 7 | 30 | 90 | "all";

export const INSIGHTS_PERIODS: { value: InsightsPeriod; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: "all", label: "All time" },
];

export type PresenceState = "online" | "update_pending" | "limited" | "offline";

export const PRESENCE_STATE_LABEL: Record<PresenceState, string> = {
  online: "Online",
  update_pending: "Update pending",
  limited: "Limited availability",
  offline: "Offline",
};

export const MEASUREMENT_NOTICE =
  "This data only reflects activity observable by Crawler. Private conversations in ChatGPT, Claude, Gemini or other assistants are not measured.";

export type InsightsKpi = {
  key: "access" | "reads" | "clicks" | "potential";
  label: string;
  /** null = not measurable / no data (not zero accesses). */
  value: number | null;
  previous: number | null;
  deltaPct: number | null;
  spark: number[];
  tooltip: string;
  /** Not enough data for a reliable statement. */
  insufficient: boolean;
  unit?: "count" | "open";
};

export type InsightsPoint = { date: string; access: number; clicks: number };

export type CoreUpdateMarker = {
  date: string;
  area: string;
  description: string;
  /** Measured accesses since this change (temporal only, not causal). */
  measuredSince: number | null;
};

export type ContentKind =
  | "product"
  | "service"
  | "faq"
  | "about"
  | "llms"
  | "llms_full"
  | "json"
  | "document"
  | "other";

export const CONTENT_KIND_LABEL: Record<ContentKind, string> = {
  product: "Product",
  service: "Service",
  faq: "FAQ",
  about: "About",
  llms: "llms.txt",
  llms_full: "llms-full.txt",
  json: "Structured JSON file",
  document: "Document",
  other: "Other",
};

export type InfoStatus = "current" | "review" | "stale" | "incomplete";

export const INFO_STATUS_LABEL: Record<InfoStatus, string> = {
  current: "Current",
  review: "Review recommended",
  stale: "Outdated",
  incomplete: "Incomplete",
};

export type TopContentRow = {
  path: string;
  label: string;
  kind: ContentKind;
  accesses: number;
  deltaPct: number | null;
  lastAccessAt: string | null;
  infoStatus: InfoStatus;
};

export type DetectedSource =
  | "crawler_tool"
  | "file_fetch"
  | "api"
  | "referral"
  | "direct"
  | "unknown";

export const SOURCE_LABEL: Record<DetectedSource, string> = {
  crawler_tool: "Crawler tool",
  file_fetch: "Public file fetch",
  api: "API",
  referral: "Website referral",
  direct: "Direct access",
  unknown: "Unknown",
};

export type EventRow = {
  at: string;
  type: string;
  content: string | null;
  source: DetectedSource;
  outbound: string | null;
};

export type NextImprovement = {
  id: string;
  title: string;
  issue: string;
  evidence: string | null;
  why: string;
  fieldPath: string;
  currentValue: string | null;
  proposedValue: string | null;
  affectedFiles: string[];
  /** Can be answered and published directly in the dialog. */
  answerable: boolean;
  question: string;
};

export type ImprovementEntry = {
  id: string;
  date: string;
  area: string;
  before: string | null;
  after: string | null;
  state: "draft" | "confirmed" | "published" | "failed";
  measuredSince: number | null;
};

export const IMPROVEMENT_STATE_LABEL: Record<ImprovementEntry["state"], string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  published: "Published",
  failed: "Failed",
};

export type RetentionSummary = {
  daysSincePublish: number | null;
  publishedUpdates: number | null;
  totalAccesses: number | null;
  nextCheckAt: string | null;
};

export type InsightsDashboard = {
  slug: string;
  name: string;
  state: PresenceState;
  publicUrl: string | null;
  lastCheckedAt: string | null;
  period: InsightsPeriod;
  maxDays: number;
  kpis: InsightsKpi[];
  series: InsightsPoint[];
  updates: CoreUpdateMarker[];
  topContent: TopContentRow[];
  sources: { source: DetectedSource; count: number }[];
  events: EventRow[];
  nextImprovement: NextImprovement | null;
  improvements: ImprovementEntry[];
  retention: RetentionSummary;
  /** No measured activity in the selected period yet. */
  empty: boolean;
  /** Example view instead of real measurement. */
  demo: boolean;
  notice: string;
};

export function formatDelta(delta: number | null): string | null {
  if (delta === null) return null;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta} %`;
}

export function periodComparisonLabel(period: InsightsPeriod): string {
  return period === "all"
    ? "No comparison period available"
    : `vs. the previous ${period} days`;
}
