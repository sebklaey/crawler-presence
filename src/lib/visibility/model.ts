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
  | "user_reported";

export type EventType = "mention" | "file_read" | "outbound_click" | "impression" | "click" | "citation";

export type MetricStatus = "live" | "delayed" | "demo" | "not_connected";

export type Period = 7 | 30 | 90 | "all";

export const PERIODS: { value: Period; label: string }[] = [
  { value: 7, label: "7 Tage" },
  { value: 30, label: "30 Tage" },
  { value: 90, label: "90 Tage" },
  { value: "all", label: "Gesamt" },
];

export const SCOPE_NOTICE =
  "Diese Analytics zeigen ausschließlich Ereignisse, die Crawler innerhalb verbundener oder öffentlich beobachtbarer Quellen messen kann. Sie umfassen nicht alle Gespräche im Internet und keine privaten Unterhaltungen in ChatGPT, Claude, Gemini oder anderen externen Assistenten.";

export const SOURCE_LABELS: Record<SourceType, { label: string; definition: string }> = {
  crawler_internal: {
    label: "Crawler-intern",
    definition: "Crawler-Tool-Aufrufe, deren Argumente diese Presence referenziert haben.",
  },
  presence_read: {
    label: "Presence-Dateizugriffe",
    definition: "Abrufe von llms.txt, llms-full.txt, Markdown- oder JSON-Dateien dieser Presence.",
  },
  authorized_ai: {
    label: "Autorisierte AI-Projekte",
    definition: "Interaktionen aus ausdrücklich verbundenen API-Projekten (Business-API).",
  },
  public_web: {
    label: "Öffentliches Web",
    definition: "Erwähnungen auf öffentlich zugänglichen Websites mit erreichbarer URL.",
  },
  search_console: {
    label: "Google Search Console",
    definition: "Impressionen und Klicks aus einer verbundenen Search-Console-Property.",
  },
  visibility_benchmark: {
    label: "Visibility Benchmark",
    definition: "Kontrollierte Testfragen an ausgewählte AI-Modelle — keine reale Nutzermessung.",
  },
  user_reported: {
    label: "Selbst gemeldet",
    definition: "Freiwillig gemeldete Erwähnungen. Nicht von Crawler verifiziert.",
  },
};

export const EVENT_LABELS: Record<EventType, string> = {
  mention: "Beobachtete Erwähnung",
  file_read: "Dateizugriff",
  outbound_click: "Ausgehender Klick",
  impression: "Impression",
  click: "Klick",
  citation: "Zitierung",
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

/** Kleine Gruppen ausblenden: Werte unter dieser Schwelle werden nicht ausgewiesen. */
export const MIN_GROUP_SIZE = 3;

export function periodLabel(period: Period): string {
  return period === "all" ? "gesamter Zeitraum" : `letzte ${period} Tage`;
}
