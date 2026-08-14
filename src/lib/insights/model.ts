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
  { value: 7, label: "7 Tage" },
  { value: 30, label: "30 Tage" },
  { value: 90, label: "90 Tage" },
  { value: "all", label: "Gesamter Zeitraum" },
];

export type PresenceState = "online" | "update_pending" | "limited" | "offline";

export const PRESENCE_STATE_LABEL: Record<PresenceState, string> = {
  online: "Online",
  update_pending: "Aktualisierung ausstehend",
  limited: "Eingeschränkt erreichbar",
  offline: "Offline",
};

export const MEASUREMENT_NOTICE =
  "Diese Daten bilden nur die von Crawler beobachtbaren Aktivitäten ab. Private Konversationen in ChatGPT, Claude, Gemini oder anderen Assistenten werden nicht gemessen.";

export type InsightsKpi = {
  key: "access" | "reads" | "clicks" | "potential";
  label: string;
  /** null = nicht messbar / keine Daten (nicht null Zugriffe). */
  value: number | null;
  previous: number | null;
  deltaPct: number | null;
  spark: number[];
  tooltip: string;
  /** Zu wenig Daten für eine belastbare Aussage. */
  insufficient: boolean;
  unit?: "count" | "open";
};

export type InsightsPoint = { date: string; access: number; clicks: number };

export type CoreUpdateMarker = {
  date: string;
  area: string;
  description: string;
  /** Gemessene Zugriffe seit dieser Änderung (rein zeitlich, nicht kausal). */
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
  product: "Produkt",
  service: "Service",
  faq: "FAQ",
  about: "About",
  llms: "llms.txt",
  llms_full: "llms-full.txt",
  json: "Strukturierte JSON-Datei",
  document: "Dokument",
  other: "Sonstiges",
};

export type InfoStatus = "current" | "review" | "stale" | "incomplete";

export const INFO_STATUS_LABEL: Record<InfoStatus, string> = {
  current: "Aktuell",
  review: "Überprüfung empfohlen",
  stale: "Veraltet",
  incomplete: "Unvollständig",
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
  crawler_tool: "Crawler-Tool",
  file_fetch: "Öffentlicher Dateiabruf",
  api: "API",
  referral: "Website-Referral",
  direct: "Direkter Zugriff",
  unknown: "Unbekannt",
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
  /** Kann direkt im Dialog beantwortet und veröffentlicht werden. */
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
  draft: "Entwurf",
  confirmed: "Bestätigt",
  published: "Veröffentlicht",
  failed: "Fehlgeschlagen",
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
  /** Noch keine gemessene Aktivität im gewählten Zeitraum. */
  empty: boolean;
  /** Beispielansicht statt echter Messung. */
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
    ? "Kein Vergleichszeitraum verfügbar"
    : `gegenüber den vorherigen ${period} Tagen`;
}
