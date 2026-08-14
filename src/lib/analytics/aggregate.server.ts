/**
 * Dashboard aggregation.
 *
 * Rules enforced here:
 *  - Evidence categories are aggregated separately and never summed.
 *  - A source that is not connected yields `null`, not 0.
 *  - Synthetic probe rates always carry sample size and confidence interval.
 */
import {
  ANALYTICS_PERIODS,
  EVIDENCE_DEFINITION,
  MIN_SAMPLE,
  PROVIDER_LABEL,
  PROVIDER_ORDER,
  SOURCE_LABEL,
  TRANSPARENCY_NOTICE,
  deltaPct,
  periodDays,
  periodLabel,
  wilsonInterval,
  type AiAnalyticsDashboard,
  type AnalyticsPeriod,
  type CitationRow,
  type ConnectorStatus,
  type DataSourceRow,
  type EvidenceType,
  type MetricCard,
  type ProviderId,
  type ProviderRow,
  type RateSummary,
  type SeriesPoint,
  type SourceType,
} from "./model";
import { credentialStatus, listSources } from "./connectors.server";

type EventRow = {
  occurred_at: string;
  event_type: string;
  source_type: string;
  evidence_type: string;
  provider: string | null;
  surface: string | null;
  path: string | null;
  locale: string | null;
  region: string | null;
  verified_bot: boolean;
  user_agent_family: string | null;
  citation_url: string | null;
  anonymous_session_hash: string | null;
  metadata: Record<string, unknown> | null;
};

type RunRow = {
  tested_at: string;
  provider: string;
  model: string;
  prompt_id: string;
  prompt_version: string;
  locale: string;
  region: string;
  mentioned: boolean | null;
  recommended: boolean | null;
  own_domain_cited: boolean | null;
  response_status: string;
  result_summary: string | null;
};

async function client() {
  const { db } = await import("../mcp/db.server");
  return db();
}

function asProvider(value: string | null | undefined): ProviderId {
  return (PROVIDER_ORDER as string[]).includes(value ?? "") ? (value as ProviderId) : "other";
}

function sessionsFrom(row: EventRow): number {
  const sessions = row.metadata?.["sessions"];
  return typeof sessions === "number" ? sessions : 1;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function emptySeriesPoint(date: string): SeriesPoint {
  return {
    date,
    presence_reads: 0,
    verified_ai_fetches: 0,
    observed_citations: 0,
    ai_referral_sessions: 0,
    synthetic_mentions: 0,
    synthetic_runs: 0,
  };
}

export type AggregateOptions = {
  slug: string;
  name: string;
  plan: string;
  period: AnalyticsPeriod;
};

export async function buildAiAnalytics(options: AggregateOptions): Promise<AiAnalyticsDashboard> {
  const supabase = await client();
  const period = ANALYTICS_PERIODS.some((p) => p.value === options.period) ? options.period : 30;
  const days = periodDays(period);
  const now = Date.now();
  const windowStart = new Date(now - days * 86_400_000);
  const previousStart = new Date(now - days * 2 * 86_400_000);

  const [sources, credentials] = await Promise.all([listSources(options.slug), Promise.resolve(credentialStatus())]);
  const sourceByType = new Map(sources.map((s) => [s.source_type, s]));

  let events: EventRow[] = [];
  let runs: RunRow[] = [];

  if (supabase) {
    const [eventResult, runResult] = await Promise.all([
      supabase
        .from("analytics_events")
        .select(
          "occurred_at, event_type, source_type, evidence_type, provider, surface, path, locale, region, verified_bot, user_agent_family, citation_url, anonymous_session_hash, metadata",
        )
        .eq("presence_slug", options.slug)
        .gte("occurred_at", previousStart.toISOString())
        .order("occurred_at", { ascending: false })
        .limit(20000),
      supabase
        .from("probe_runs")
        .select(
          "tested_at, provider, model, prompt_id, prompt_version, locale, region, mentioned, recommended, own_domain_cited, response_status, result_summary",
        )
        .eq("presence_slug", options.slug)
        .gte("tested_at", previousStart.toISOString())
        .order("tested_at", { ascending: false })
        .limit(5000),
    ]);
    events = (eventResult.data ?? []) as EventRow[];
    runs = (runResult.data ?? []) as RunRow[];
  }

  const inWindow = events.filter((e) => new Date(e.occurred_at) >= windowStart);
  const inPrevious = events.filter(
    (e) => new Date(e.occurred_at) < windowStart && new Date(e.occurred_at) >= previousStart,
  );
  const runsWindow = runs.filter((r) => new Date(r.tested_at) >= windowStart && r.response_status === "ok");
  const runsPrevious = runs.filter(
    (r) => new Date(r.tested_at) < windowStart && new Date(r.tested_at) >= previousStart && r.response_status === "ok",
  );

  /* ---- counters ---- */
  const count = (rows: EventRow[], predicate: (row: EventRow) => boolean) => rows.filter(predicate).length;
  const isPresenceRead = (row: EventRow) => row.event_type === "presence_read" || row.event_type === "api_request" || row.event_type === "mcp_retrieval";
  const isCitation = (row: EventRow) => row.event_type === "observed_citation";
  const isReferral = (row: EventRow) => row.event_type === "ai_referral_session";

  const presenceReads = count(inWindow, isPresenceRead);
  const presenceReadsPrev = count(inPrevious, isPresenceRead);
  const observedCitations = count(inWindow, isCitation);
  const observedCitationsPrev = count(inPrevious, isCitation);

  const ga4Source = sourceByType.get("ga4");
  const ga4Connected = ga4Source?.status === "connected";
  const referralSessions = ga4Connected
    ? inWindow.filter(isReferral).reduce((sum, row) => sum + sessionsFrom(row), 0)
    : null;
  const referralSessionsPrev = ga4Connected
    ? inPrevious.filter(isReferral).reduce((sum, row) => sum + sessionsFrom(row), 0)
    : null;

  const syntheticMentions = runsWindow.filter((r) => r.mentioned).length;
  const syntheticRate = runsWindow.length ? syntheticMentions / runsWindow.length : null;
  const syntheticRatePrev = runsPrevious.length
    ? runsPrevious.filter((r) => r.mentioned).length / runsPrevious.length
    : null;
  const syntheticCi = runsWindow.length ? wilsonInterval(syntheticMentions, runsWindow.length) : null;

  const lastUpdated = (source: SourceType) => sourceByType.get(source)?.last_synced_at ?? null;
  const statusOf = (source: SourceType): ConnectorStatus => {
    const record = sourceByType.get(source);
    if (source === "crawler_observed" || source === "server_logs") return "built_in";
    if (!record || record.status === "not_connected") return "not_connected";
    if (record.status === "error") return "error";
    const synced = record.last_synced_at ? new Date(record.last_synced_at).getTime() : 0;
    if (synced && now - synced > 48 * 3_600_000) return "stale";
    return "connected";
  };

  const windowText = periodLabel(period);

  const cards: MetricCard[] = [
    {
      key: "observed_citations",
      label: "Observed AI citations",
      value: observedCitations,
      previous: observedCitationsPrev,
      deltaPct: deltaPct(observedCitations, observedCitationsPrev),
      unit: "count",
      evidence: "observed",
      tooltip: `${EVIDENCE_DEFINITION.observed} Citations are counted only when a provider reports the cited URL (currently the Bing AI performance export).`,
      periodLabel: windowText,
      lastUpdatedAt: lastUpdated("bing_csv"),
      status: statusOf("bing_csv"),
      statusHint:
        statusOf("bing_csv") === "not_connected"
          ? "Import the Bing Webmaster Tools AI performance CSV to see reported citations."
          : null,
    },
    {
      key: "ai_referral_sessions",
      label: "AI referral sessions",
      value: referralSessions,
      previous: referralSessionsPrev,
      deltaPct: deltaPct(referralSessions, referralSessionsPrev),
      unit: "count",
      evidence: "attributed",
      tooltip: `${EVIDENCE_DEFINITION.attributed} Only sessions whose referrer is a known AI surface are counted.`,
      periodLabel: windowText,
      lastUpdatedAt: lastUpdated("ga4"),
      status: statusOf("ga4"),
      statusHint: ga4Connected ? null : "Connect a GA4 property to attribute website visits coming from AI answers.",
    },
    {
      key: "presence_reads",
      label: "Presence reads by AI clients",
      value: presenceReads,
      previous: presenceReadsPrev,
      deltaPct: deltaPct(presenceReads, presenceReadsPrev),
      unit: "count",
      evidence: "observed",
      tooltip:
        "Server-side requests for your published Presence files, CrawlMe API calls and MCP retrievals. A fetch is not a citation.",
      periodLabel: windowText,
      lastUpdatedAt: new Date().toISOString(),
      status: "built_in",
      statusHint: null,
    },
    {
      key: "synthetic_visibility",
      label: "Test visibility rate",
      value: syntheticRate === null ? null : Math.round(syntheticRate * 1000) / 10,
      previous: syntheticRatePrev === null ? null : Math.round(syntheticRatePrev * 1000) / 10,
      deltaPct:
        syntheticRate !== null && syntheticRatePrev !== null && syntheticRatePrev > 0
          ? Math.round(((syntheticRate - syntheticRatePrev) / syntheticRatePrev) * 100)
          : null,
      unit: "percent",
      evidence: "synthetic",
      tooltip: EVIDENCE_DEFINITION.synthetic,
      periodLabel: windowText,
      lastUpdatedAt: runsWindow[0]?.tested_at ?? null,
      status: credentials.ai_probes ? (runsWindow.length ? "connected" : "not_connected") : "not_connected",
      statusHint: credentials.ai_probes
        ? runsWindow.length
          ? null
          : "No test runs in this period yet."
        : "Add an AI provider API key to run controlled visibility tests.",
      sample: syntheticCi
        ? {
            n: runsWindow.length,
            ciLow: Math.round(syntheticCi.low * 1000) / 10,
            ciHigh: Math.round(syntheticCi.high * 1000) / 10,
            preliminary: runsWindow.length < MIN_SAMPLE,
          }
        : null,
    },
  ];

  /* ---- time series ---- */
  const buckets = new Map<string, SeriesPoint>();
  const bucketDays = Math.min(days, 180);
  for (let i = bucketDays - 1; i >= 0; i -= 1) {
    const date = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    buckets.set(date, emptySeriesPoint(date));
  }
  for (const row of inWindow) {
    const point = buckets.get(dayKey(row.occurred_at));
    if (!point) continue;
    if (isPresenceRead(row)) {
      point.presence_reads += 1;
      if (row.verified_bot) point.verified_ai_fetches += 1;
    }
    if (isCitation(row)) point.observed_citations += 1;
    if (isReferral(row) && ga4Connected) point.ai_referral_sessions += sessionsFrom(row);
  }
  for (const run of runsWindow) {
    const point = buckets.get(dayKey(run.tested_at));
    if (!point) continue;
    point.synthetic_runs += 1;
    if (run.mentioned) point.synthetic_mentions += 1;
  }
  const series = [...buckets.values()];

  /* ---- provider comparison ---- */
  const providers: ProviderRow[] = PROVIDER_ORDER.map((provider) => {
    const providerEvents = inWindow.filter((e) => asProvider(e.provider) === provider);
    const providerRuns = runsWindow.filter((r) => asProvider(r.provider) === provider);
    const recommendable = providerRuns.filter((r) => r.recommended !== null);
    const fetches = providerEvents.filter(isPresenceRead).length;
    return {
      provider,
      label: PROVIDER_LABEL[provider],
      connection: providerRuns.length ? "connected" : "not_connected",
      observedFetches: fetches,
      observedCitations: providerEvents.filter(isCitation).length,
      referralSessions: ga4Connected
        ? providerEvents.filter(isReferral).reduce((sum, row) => sum + sessionsFrom(row), 0)
        : null,
      syntheticMentionRate: providerRuns.length ? providerRuns.filter((r) => r.mentioned).length / providerRuns.length : null,
      syntheticCitationRate: providerRuns.length
        ? providerRuns.filter((r) => r.own_domain_cited).length / providerRuns.length
        : null,
      syntheticRecommendationRate: recommendable.length
        ? recommendable.filter((r) => r.recommended).length / recommendable.length
        : null,
      sampleSize: providerRuns.length,
      lastSyncedAt: providerRuns[0]?.tested_at ?? null,
    };
  });

  /* ---- citation / event table ---- */
  const citations: CitationRow[] = [
    ...inWindow
      .filter((row) => isCitation(row) || isPresenceRead(row) || isReferral(row))
      .slice(0, 200)
      .map((row, index) => ({
        id: `${row.occurred_at}-${index}`,
        occurredAt: row.occurred_at,
        provider: asProvider(row.provider),
        surface: row.surface,
        entity: options.name,
        url: row.citation_url ?? row.path,
        prompt: null,
        model: null,
        evidence: (row.evidence_type as EvidenceType) ?? "observed",
        source: (row.source_type as SourceType) ?? "server_logs",
        verified: row.verified_bot,
      })),
    ...runsWindow.slice(0, 100).map((run, index) => ({
      id: `run-${run.tested_at}-${index}`,
      occurredAt: run.tested_at,
      provider: asProvider(run.provider),
      surface: "Controlled test",
      entity: options.name,
      url: null,
      prompt: `${run.prompt_id} (${run.prompt_version})`,
      model: run.model,
      evidence: "synthetic" as EvidenceType,
      source: "ai_probes" as SourceType,
      verified: false,
    })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  /* ---- rate summaries ---- */
  const recommendableRuns = runsWindow.filter((r) => r.recommended !== null);
  const citedRuns = runsWindow.filter((r) => r.own_domain_cited).length;
  const makeRate = (
    key: RateSummary["key"],
    label: string,
    successes: number,
    n: number,
  ): RateSummary => {
    const ci = n ? wilsonInterval(successes, n) : null;
    return {
      key,
      label,
      rate: n ? successes / n : null,
      n,
      ciLow: ci ? ci.low : null,
      ciHigh: ci ? ci.high : null,
      preliminary: n > 0 && n < MIN_SAMPLE,
      providers: [...new Set(runsWindow.map((r) => PROVIDER_LABEL[asProvider(r.provider)]))],
      models: [...new Set(runsWindow.map((r) => r.model))],
      promptVersions: [...new Set(runsWindow.map((r) => r.prompt_version))],
      windowLabel: windowText,
    };
  };

  const rates: RateSummary[] = [
    makeRate("synthetic_mention_rate", "Mention rate in tests", syntheticMentions, runsWindow.length),
    makeRate("synthetic_citation_rate", "Own source cited in tests", citedRuns, runsWindow.length),
    makeRate(
      "synthetic_recommendation_rate",
      "Recommendation rate in tests",
      recommendableRuns.filter((r) => r.recommended).length,
      recommendableRuns.length,
    ),
  ];

  /* ---- data source panel ---- */
  const sourceTypes: SourceType[] = ["crawler_observed", "server_logs", "ga4", "search_console", "bing_csv", "ai_probes"];
  const evidenceForSource: Record<SourceType, EvidenceType> = {
    crawler_observed: "observed",
    server_logs: "observed",
    ga4: "attributed",
    search_console: "attributed",
    bing_csv: "observed",
    ai_probes: "synthetic",
  };
  const setupHints: Record<SourceType, string> = {
    crawler_observed: "Always on: Crawler tool calls and trackable outbound clicks.",
    server_logs: "Always on: every request for your published Presence files is logged server-side.",
    ga4: "Add the GA4 property ID and grant the Crawler service account read access in Google Analytics.",
    search_console: "One click: Crawler uses the connected Google account and imports impressions, clicks, CTR and position for your verified property.",
    bing_csv: "Microsoft publishes no API for this data. Drop the official AI performance CSV from Bing Webmaster Tools here.",
    ai_probes: "One click: Crawler runs controlled test questions against its built-in test model. Your own provider keys add more models.",

  };

  const dataSources: DataSourceRow[] = sourceTypes.map((source) => {
    const record = sourceByType.get(source);
    const status = statusOf(source);
    return {
      source,
      label: SOURCE_LABEL[source],
      status,
      evidence: evidenceForSource[source],
      lastSyncedAt: record?.last_synced_at ?? null,
      nextSyncAt: record?.next_sync_at ?? null,
      recordsImported: record?.records_imported ?? null,
      error: record?.last_error ?? null,
      credentialsPresent: credentials[source],
      setupHint: setupHints[source],
      configLabel: source === "ga4" ? "GA4 property ID" : null,

      configValue:
        source === "ga4"
          ? ((record?.configuration?.["property_id"] as string) ?? null)
          : source === "search_console"
            ? ((record?.configuration?.["site_url"] as string) ?? null)
            : null,
      canSync: source === "ga4" || source === "search_console" || source === "ai_probes",
    };
  });

  const stale = dataSources.filter((s) => s.status === "stale").map((s) => s.source);

  return {
    slug: options.slug,
    name: options.name,
    plan: options.plan,
    period,
    windowLabel: windowText,
    generatedAt: new Date().toISOString(),
    cards,
    series,
    availableFilters: {
      providers: [...new Set(inWindow.map((e) => asProvider(e.provider)))],
      sources: [...new Set(inWindow.map((e) => e.source_type as SourceType))],
      evidence: [...new Set(inWindow.map((e) => e.evidence_type as EvidenceType))],
      locales: [...new Set(inWindow.map((e) => e.locale).filter((v): v is string => Boolean(v)))],
      regions: [...new Set(inWindow.map((e) => e.region).filter((v): v is string => Boolean(v)))],
      eventTypes: [...new Set(inWindow.map((e) => e.event_type))],
    },
    providers,
    citations: citations.slice(0, 200),
    rates,
    dataSources,
    partial: dataSources.some((s) => s.status === "error"),
    stale,
    empty: inWindow.length === 0 && runsWindow.length === 0,
    notice: TRANSPARENCY_NOTICE,
  };
}
