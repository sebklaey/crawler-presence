/**
 * Server-side aggregation for AI Visibility Analytics.
 *
 * Reads two event stores and unifies them:
 *  - `presence_analytics_events` — the existing Crawler-internal events
 *    (tool-call mentions, public file reads, trackable outbound clicks)
 *  - `analytics_events` — the source-typed store used by the adapters
 *    (public web, search console, authorized AI projects, user reported)
 *
 * Nothing here fabricates data. An adapter without a connected integration
 * reports "not_connected" and contributes zero — never a placeholder number.
 */
import {
  EVENT_LABELS,
  MIN_GROUP_SIZE,
  SOURCE_LABELS,
  SCOPE_NOTICE,
  type AdapterState,
  type BenchmarkRow,
  type EventType,
  type Kpi,
  type MentionRow,
  type MetricStatus,
  type Period,
  type PublicVisibility,
  type ReadRow,
  type SeriesPoint,
  type SourceType,
  type VisibilityDashboard,
  periodLabel,
} from "./model";

type Row = {
  occurred_at: string;
  source_type: SourceType;
  event_type: EventType;
  session: string | null;
  resource_path: string | null;
  referrer_category: string | null;
  public_source_url: string | null;
  entity_match: string | null;
  confidence: number | null;
};

/**
 * A dashboard built from a failed query would show measured zeros for events
 * that did happen, so every read here fails loudly instead.
 */
function readFailure(operation: string, detail: string): never {
  console.error(`[crawler] visibility read failed (${operation})`, detail);
  throw new Error(
    "Die Analytics konnten gerade nicht gelesen werden. Bitte in einem Moment erneut versuchen.",
  );
}

async function db() {
  try {
    const { db } = await import("../mcp/db.server");
    return db();
  } catch (error) {
    readFailure("client", error instanceof Error ? error.message : String(error));
  }
}

function windowStart(period: Period, offset = 0): string | null {
  if (period === "all") return offset === 0 ? null : null;
  return new Date(Date.now() - (period * (offset + 1)) * 86_400_000).toISOString();
}

/** Loads unified rows for [now - period*(offset+1), now - period*offset). */
async function loadRows(slug: string, period: Period, offset = 0): Promise<Row[]> {
  const supabase = await db();
  if (!supabase) return [];
  if (period === "all" && offset > 0) return [];

  const from = windowStart(period, offset);
  const to = period === "all" || offset === 0 ? null : new Date(Date.now() - period * offset * 86_400_000).toISOString();

  let legacy = supabase
    .from("presence_analytics_events")
    .select("event_type, occurred_at, source, file_path, session_fingerprint")
    .eq("presence_slug", slug)
    .order("occurred_at", { ascending: true })
    .limit(20000);
  if (from) legacy = legacy.gte("occurred_at", from);
  if (to) legacy = legacy.lt("occurred_at", to);

  let modern = supabase
    .from("analytics_events")
    .select(
      "event_type, source_type, occurred_at, anonymous_session_hash, resource_path, referrer_category, public_source_url, entity_match, confidence",
    )
    .eq("presence_slug", slug)
    .order("occurred_at", { ascending: true })
    .limit(20000);
  if (from) modern = modern.gte("occurred_at", from);
  if (to) modern = modern.lt("occurred_at", to);

  const [legacyResult, modernResult] = await Promise.all([legacy, modern]);
  if (legacyResult.error) readFailure("legacy-events", legacyResult.error.message);
  if (modernResult.error) readFailure("events", modernResult.error.message);
  const rows: Row[] = [];

  for (const r of (legacyResult.data ?? []) as {
    event_type: string;
    occurred_at: string;
    source: string;
    file_path: string | null;
    session_fingerprint: string | null;
  }[]) {
    const isRead = r.event_type === "file_read";
    rows.push({
      occurred_at: r.occurred_at,
      source_type: isRead ? "presence_read" : "crawler_internal",
      event_type: (r.event_type === "conversation" ? "mention" : (r.event_type as EventType)) ?? "mention",
      session: r.session_fingerprint,
      resource_path: r.file_path,
      referrer_category: r.source === "crawler" ? "bot/crawler" : r.source === "web" ? "web" : "unbekannt",
      public_source_url: null,
      entity_match: null,
      confidence: null,
    });
  }

  for (const r of (modernResult.data ?? []) as {
    event_type: string;
    source_type: string;
    occurred_at: string;
    anonymous_session_hash: string | null;
    resource_path: string | null;
    referrer_category: string | null;
    public_source_url: string | null;
    entity_match: string | null;
    confidence: number | null;
  }[]) {
    rows.push({
      occurred_at: r.occurred_at,
      source_type: r.source_type as SourceType,
      event_type: r.event_type as EventType,
      session: r.anonymous_session_hash,
      resource_path: r.resource_path,
      referrer_category: r.referrer_category,
      public_source_url: r.public_source_url,
      entity_match: r.entity_match,
      confidence: r.confidence,
    });
  }

  return rows.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}

const MENTION_EVENTS: EventType[] = ["mention", "citation"];

function isMention(row: Row) {
  return MENTION_EVENTS.includes(row.event_type);
}

function delta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * AI Visibility Score, 0–100, ausschließlich aus gemessenen Signalen:
 * beobachtete Erwähnungen, Dateizugriffe, Quellenvielfalt und Benchmark-Treffer.
 * Kein Ranking-Versprechen — eine Verdichtung vorhandener Messwerte.
 */
function visibilityScore(input: {
  mentions: number;
  reads: number;
  sessions: number;
  sources: number;
  benchmarkMentionRate: number | null;
}): number {
  const cap = (value: number, max: number) => Math.min(value, max);
  const score =
    cap(Math.log10(input.mentions + 1) * 22, 30) +
    cap(Math.log10(input.reads + 1) * 22, 30) +
    cap(Math.log10(input.sessions + 1) * 15, 15) +
    cap(input.sources * 5, 15) +
    (input.benchmarkMentionRate === null ? 0 : (input.benchmarkMentionRate / 100) * 10);
  return Math.round(Math.min(100, score));
}

async function loadIntegrations(slug: string) {
  const supabase = await db();
  if (!supabase) return new Map<string, { status: string; last: string | null }>();
  const { data, error } = await supabase
    .from("analytics_integrations")
    .select("integration_type, connection_status, last_synced_at")
    .eq("presence_slug", slug);
  // Otherwise a connected integration would be shown as "not connected".
  if (error) readFailure("integrations", error.message);
  const map = new Map<string, { status: string; last: string | null }>();
  for (const row of (data ?? []) as { integration_type: string; connection_status: string; last_synced_at: string | null }[]) {
    map.set(row.integration_type, { status: row.connection_status, last: row.last_synced_at });
  }
  return map;
}

const ADAPTER_META: Record<
  SourceType,
  { builtIn: boolean; measured: string; notMeasured: string; connectHint: string | null }
> = {
  crawler_internal: {
    builtIn: true,
    measured: "Crawler-Tool-Aufrufe, deren Argumente diese Presence referenzieren.",
    notMeasured: "Der Gesprächsinhalt selbst. Crawler erhält ihn nie.",
    connectHint: null,
  },
  presence_read: {
    builtIn: true,
    measured: "Abrufe der veröffentlichten Presence-Dateien unter /p/<slug>/…",
    notMeasured: "Ob ein Abruf zu einer Zitierung oder Empfehlung geführt hat.",
    connectHint: null,
  },
  ai_retrieval: {
    builtIn: true,
    measured: "Abrufe des veröffentlichten Knowledge Core über die CrawlMe API oder MCP.",
    notMeasured: "Ob das abrufende AI-System die Information anschließend verwendet hat.",
    connectHint: null,
  },
  authorized_ai: {
    builtIn: false,
    measured: "Interaktionen aus ausdrücklich verbundenen API-Projekten.",
    notMeasured: "Alle nicht verbundenen AI-Projekte und Assistenten.",
    connectHint: "Business-API-Zugang mit dem Recovery-Code verwenden, um Projekte zu verbinden.",
  },
  public_web: {
    builtIn: false,
    measured: "Erwähnungen auf öffentlich zugänglichen Seiten mit erreichbarer URL.",
    notMeasured: "Inhalte hinter Login, in Apps oder in privaten Chats.",
    connectHint: "Öffentliche Quellen im Retention-Bereich hinterlegen, um sie beobachten zu lassen.",
  },
  search_console: {
    builtIn: false,
    measured: "Impressionen und Klicks einer verbundenen Search-Console-Property.",
    notMeasured: "Suchanfragen ohne Zuordnung zur Property.",
    connectHint: "Search-Console-Property verbinden (Adapter vorbereitet, noch nicht konfiguriert).",
  },
  visibility_benchmark: {
    builtIn: false,
    measured: "Kontrollierte Testfragen an ausgewählte AI-Modelle.",
    notMeasured: "Reale Nutzerfragen. Der Benchmark ist keine Nutzermessung.",
    connectHint: "Benchmark-Läufe aktivieren, um regelmäßig neutrale Testfragen auszuführen.",
  },
  user_reported: {
    builtIn: false,
    measured: "Von dir gemeldete Erwähnungen mit Quelle.",
    notMeasured: "Alles Ungemeldete. Diese Angaben sind nicht verifiziert.",
    connectHint: "Erwähnungen über den Business-API-Endpunkt melden.",
  },
};

function adapterStatus(type: SourceType, integrations: Map<string, { status: string; last: string | null }>, hasData: boolean): MetricStatus {
  if (ADAPTER_META[type].builtIn) return "live";
  const entry = integrations.get(type);
  if (!entry || entry.status === "not_connected") return hasData ? "delayed" : "not_connected";
  if (entry.status === "connected") return "live";
  if (entry.status === "delayed") return "delayed";
  if (entry.status === "demo") return "demo";
  return "not_connected";
}

async function loadBenchmarks(slug: string, period: Period): Promise<BenchmarkRow[]> {
  const supabase = await db();
  if (!supabase) return [];
  let query = supabase
    .from("visibility_benchmarks")
    .select("tested_at, provider, model, prompt_key, prompt_version, entity_mentioned, description_correct, source_cited, position, detected_issues, result_summary")
    .eq("presence_slug", slug)
    .order("tested_at", { ascending: false })
    .limit(100);
  if (period !== "all") query = query.gte("tested_at", new Date(Date.now() - period * 86_400_000).toISOString());
  const { data, error } = await query;
  if (error) readFailure("benchmarks", error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    testedAt: String(r["tested_at"]),
    provider: String(r["provider"]),
    model: String(r["model"]),
    prompt: String(r["prompt_key"]),
    promptVersion: String(r["prompt_version"] ?? "v1"),
    mentioned: Boolean(r["entity_mentioned"]),
    descriptionCorrect: r["description_correct"] === null ? null : Boolean(r["description_correct"]),
    sourceCited: Boolean(r["source_cited"]),
    position: r["position"] === null ? null : Number(r["position"]),
    issues: Array.isArray(r["detected_issues"]) ? (r["detected_issues"] as string[]).map(String) : [],
    summary: r["result_summary"] ? String(r["result_summary"]) : null,
  }));
}

function buildSeries(rows: Row[], period: Period): SeriesPoint[] {
  const byDay = new Map<string, SeriesPoint>();
  const days = period === "all" ? 0 : period;
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    byDay.set(date, { date, mentions: 0, reads: 0 });
  }
  for (const row of rows) {
    const date = row.occurred_at.slice(0, 10);
    const point = byDay.get(date) ?? { date, mentions: 0, reads: 0 };
    if (isMention(row)) point.mentions += 1;
    if (row.event_type === "file_read") point.reads += 1;
    byDay.set(date, point);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildInsights(current: Row[], previous: Row[], benchmarks: BenchmarkRow[]): string[] {
  const out: string[] = [];
  const readsBy = (rows: Row[]) => {
    const map = new Map<string, number>();
    for (const r of rows) if (r.event_type === "file_read" && r.resource_path) map.set(r.resource_path, (map.get(r.resource_path) ?? 0) + 1);
    return map;
  };
  const now = readsBy(current);
  const before = readsBy(previous);
  for (const [path, count] of [...now.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    const prev = before.get(path) ?? 0;
    if (count >= MIN_GROUP_SIZE && count > prev) {
      out.push(`${path} wurde häufiger abgerufen als im vorherigen Zeitraum (${count} statt ${prev} Zugriffe).`);
    }
  }

  const mentions = current.filter(isMention).length;
  const reads = current.filter((r) => r.event_type === "file_read").length;
  if (mentions >= MIN_GROUP_SIZE && reads === 0) {
    out.push("Die Presence wird erwähnt, aber ihre Dateien wurden im Zeitraum nicht abgerufen.");
  }
  const citations = current.filter((r) => r.event_type === "citation").length;
  if (reads >= MIN_GROUP_SIZE && citations === 0) {
    out.push("Die Presence wird gefunden, aber in beobachteten öffentlichen Quellen selten als Quelle verlinkt.");
  }

  if (benchmarks.length) {
    const issues = new Map<string, number>();
    for (const b of benchmarks) for (const issue of b.issues) issues.set(issue, (issues.get(issue) ?? 0) + 1);
    for (const [issue, count] of [...issues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
      out.push(`Im kontrollierten Benchmark trat „${issue}" in ${count} von ${benchmarks.length} Testantworten auf.`);
    }
    const notCited = benchmarks.filter((b) => b.mentioned && !b.sourceCited).length;
    if (notCited >= MIN_GROUP_SIZE) {
      out.push(`${notCited} Benchmark-Antworten erwähnten die Presence, ohne eine Crawler-Quelle anzugeben.`);
    }
  }

  if (!out.length) out.push("Noch zu wenige gemessene Ereignisse für belastbare Hinweise.");
  return out;
}

export async function buildDashboard(input: {
  slug: string;
  plan: string;
  period: Period;
  source?: SourceType | "all";
  eventType?: EventType | "all";
}): Promise<VisibilityDashboard> {
  const { slug, plan, period } = input;
  const [rawCurrent, rawPrevious, integrations, benchmarks] = await Promise.all([
    loadRows(slug, period, 0),
    loadRows(slug, period, 1),
    loadIntegrations(slug),
    loadBenchmarks(slug, period),
  ]);

  const filtered = rawCurrent.filter(
    (r) =>
      (!input.source || input.source === "all" || r.source_type === input.source) &&
      (!input.eventType || input.eventType === "all" || r.event_type === input.eventType),
  );

  const count = (rows: Row[], predicate: (r: Row) => boolean) => rows.filter(predicate).length;
  const mentionsNow = count(filtered, isMention);
  const mentionsBefore = count(rawPrevious, isMention);
  const readsNow = count(filtered, (r) => r.event_type === "file_read");
  const readsBefore = count(rawPrevious, (r) => r.event_type === "file_read");
  const sessionsNow = new Set(filtered.map((r) => r.session).filter(Boolean)).size;
  const sessionsBefore = new Set(rawPrevious.map((r) => r.session).filter(Boolean)).size;
  const webNow = count(filtered, (r) => r.source_type === "public_web");
  const webBefore = count(rawPrevious, (r) => r.source_type === "public_web");
  const aiNow = count(filtered, (r) => r.source_type === "authorized_ai");
  const aiBefore = count(rawPrevious, (r) => r.source_type === "authorized_ai");

  const benchmarkMentionRate = benchmarks.length
    ? Math.round((benchmarks.filter((b) => b.mentioned).length / benchmarks.length) * 100)
    : null;
  const activeSources = new Set(filtered.map((r) => r.source_type)).size;
  const scoreNow = visibilityScore({
    mentions: mentionsNow,
    reads: readsNow,
    sessions: sessionsNow,
    sources: activeSources,
    benchmarkMentionRate,
  });
  const scoreBefore = visibilityScore({
    mentions: mentionsBefore,
    reads: readsBefore,
    sessions: sessionsBefore,
    sources: new Set(rawPrevious.map((r) => r.source_type)).size,
    benchmarkMentionRate: null,
  });

  const kpi = (
    key: string,
    label: string,
    value: number,
    previous: number,
    source: SourceType | "computed",
    definition: string,
    status: MetricStatus,
    unit?: "score",
  ): Kpi => ({
    key,
    label,
    value,
    previous,
    delta: delta(value, previous),
    ...(unit ? { unit } : {}),
    source,
    sourceLabel: source === "computed" ? "Berechnet aus gemessenen Signalen" : SOURCE_LABELS[source].label,
    definition,
    status,
  });

  const webStatus = adapterStatus("public_web", integrations, webNow > 0);
  const aiStatus = adapterStatus("authorized_ai", integrations, aiNow > 0);

  const kpis: Kpi[] = [
    kpi(
      "mentions",
      "Beobachtete Erwähnungen",
      mentionsNow,
      mentionsBefore,
      "crawler_internal",
      "Ereignisse, bei denen ein Crawler-Tool-Aufruf oder eine beobachtete öffentliche Quelle diese Presence referenziert hat. Keine Aussage über Personen.",
      "live",
    ),
    kpi(
      "sessions",
      "Unterschiedliche anonyme Sessions",
      sessionsNow,
      sessionsBefore,
      "crawler_internal",
      "Anzahl unterschiedlicher, nicht rückführbarer Session-Hashes mit mindestens einem Ereignis.",
      "live",
    ),
    kpi(
      "reads",
      "Presence-Dateizugriffe",
      readsNow,
      readsBefore,
      "presence_read",
      "Abrufe der veröffentlichten Dateien. Ein Abruf ist keine nachgewiesene Zitierung oder Empfehlung.",
      "live",
    ),
    kpi(
      "public_web",
      "Öffentliche Web-Erwähnungen",
      webNow,
      webBefore,
      "public_web",
      "Erwähnungen auf öffentlich zugänglichen Seiten, die Crawler beobachten konnte.",
      webStatus,
    ),
    kpi(
      "authorized_ai",
      "Autorisierte AI-Interaktionen",
      aiNow,
      aiBefore,
      "authorized_ai",
      "Interaktionen aus ausdrücklich verbundenen API-Projekten. Private Assistenten-Gespräche sind nicht enthalten.",
      aiStatus,
    ),
    kpi(
      "score",
      "AI Visibility Score",
      scoreNow,
      scoreBefore,
      "computed",
      "Verdichtung der gemessenen Signale (Erwähnungen, Dateizugriffe, Sessions, Quellenvielfalt, Benchmark-Treffer) auf einen Wert von 0–100. Kein Ranking-Versprechen.",
      "live",
      "score",
    ),
  ];

  const bySource = new Map<SourceType, number>();
  for (const row of filtered) bySource.set(row.source_type, (bySource.get(row.source_type) ?? 0) + 1);

  const byFile = new Map<string, { reads: number; sessions: Set<string>; referrer: Set<string> }>();
  for (const row of filtered) {
    if (row.event_type !== "file_read") continue;
    const path = row.resource_path ?? "(unbekannt)";
    const entry = byFile.get(path) ?? { reads: 0, sessions: new Set<string>(), referrer: new Set<string>() };
    entry.reads += 1;
    if (row.session) entry.sessions.add(row.session);
    entry.referrer.add(row.referrer_category ?? "unbekannt");
    byFile.set(path, entry);
  }

  const reads: ReadRow[] = [...byFile.entries()]
    .map(([path, entry]) => ({
      path,
      reads: entry.reads,
      uniqueSessions: entry.sessions.size,
      referrer: [...entry.referrer].join(", "),
      client: [...entry.referrer].includes("bot/crawler") ? "Bot / Crawler" : "Unbekannter Client",
    }))
    .sort((a, b) => b.reads - a.reads);

  const mentions: MentionRow[] = filtered
    .filter(isMention)
    .slice(-200)
    .reverse()
    .map((r) => ({
      occurredAt: r.occurred_at,
      source: r.source_type,
      entity: r.entity_match,
      mentionType: r.event_type,
      publicUrl: r.public_source_url,
      confidence: r.confidence,
    }));

  const adapters: AdapterState[] = (Object.keys(ADAPTER_META) as SourceType[]).map((type) => {
    const hasData = filtered.some((r) => r.source_type === type) || (type === "visibility_benchmark" && benchmarks.length > 0);
    const entry = integrations.get(type);
    return {
      type,
      label: SOURCE_LABELS[type].label,
      definition: SOURCE_LABELS[type].definition,
      status: adapterStatus(type, integrations, hasData),
      lastSyncedAt: entry?.last ?? null,
      measured: ADAPTER_META[type].measured,
      notMeasured: ADAPTER_META[type].notMeasured,
      connectHint: ADAPTER_META[type].connectHint,
    };
  });

  return {
    slug,
    plan,
    period,
    windowLabel: periodLabel(period),
    dataSince: rawCurrent[0]?.occurred_at ?? null,
    demo: false,
    kpis,
    series: buildSeries(filtered, period),
    sourceBreakdown: [...bySource.entries()]
      .map(([source, count]) => ({ source, label: SOURCE_LABELS[source]?.label ?? source, count }))
      .sort((a, b) => b.count - a.count),
    mentions,
    reads,
    benchmarks,
    benchmarkSummary: {
      runs: benchmarks.length,
      mentionRate: benchmarkMentionRate,
      correctRate: benchmarks.length
        ? Math.round((benchmarks.filter((b) => b.descriptionCorrect === true).length / benchmarks.length) * 100)
        : null,
      citedRate: benchmarks.length
        ? Math.round((benchmarks.filter((b) => b.sourceCited).length / benchmarks.length) * 100)
        : null,
    },
    adapters,
    insights: buildInsights(filtered, rawPrevious, benchmarks),
    scopeNotice: SCOPE_NOTICE,
  };
}

/** Reduzierte, rein aggregierte öffentliche Ansicht. */
export async function buildPublic(slug: string, period: Period): Promise<PublicVisibility> {
  const rows = await loadRows(slug, period, 0);
  return {
    slug,
    period,
    distinctSessions: new Set(rows.map((r) => r.session).filter(Boolean)).size,
    mentionEvents: rows.filter(isMention).length,
    presenceReads: rows.filter((r) => r.event_type === "file_read").length,
    dataSince: rows[0]?.occurred_at ?? null,
    scopeNotice: SCOPE_NOTICE,
  };
}

export { EVENT_LABELS };
