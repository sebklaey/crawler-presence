/**
 * Server-side builder for the Insights dashboard.
 *
 * Reads only measured Crawler events (see `visibility/aggregate.server`) plus
 * the stored Knowledge Core and improvement records. Nothing is invented: when
 * a value cannot be measured it stays `null`, and every comparison is phrased
 * as a temporal one ("seit der Änderung"), never as a causal one.
 */
import { loadRows, type Row } from "../visibility/aggregate.server";
import type { PublishedPresence } from "../mcp/presences";
import {
  CONTENT_KIND_LABEL,
  MEASUREMENT_NOTICE,
  type ContentKind,
  type DetectedSource,
  type EventRow,
  type ImprovementEntry,
  type InfoStatus,
  type InsightsDashboard,
  type InsightsKpi,
  type InsightsPeriod,
  type InsightsPoint,
  type NextImprovement,
  type PresenceState,
  type TopContentRow,
} from "./model";

const DAY = 86_400_000;

function pct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function isClick(row: Row) {
  return row.event_type === "outbound_click" || row.event_type === "click";
}

function isAccess(row: Row) {
  return !isClick(row);
}

function detectSource(row: Row): DetectedSource {
  if (row.event_type === "api_request" || row.source_type === "ai_retrieval") return "api";
  if (row.source_type === "crawler_internal") return "crawler_tool";
  if (row.source_type === "presence_read") {
    if (row.referrer_category === "web") return "referral";
    if (row.referrer_category === "bot/crawler") return "file_fetch";
    return row.referrer_category ? "file_fetch" : "unknown";
  }
  if (row.referrer_category === "web") return "referral";
  if (row.referrer_category === "direct") return "direct";
  return "unknown";
}

function contentKind(path: string): ContentKind {
  const p = path.toLowerCase();
  if (p.includes("llms-full")) return "llms_full";
  if (p.includes("llms.txt")) return "llms";
  if (p.includes("faq")) return "faq";
  if (p.includes("about") || p.includes("cv")) return "about";
  if (p.includes("product") || p.includes("offering")) return "product";
  if (p.includes("service")) return "service";
  if (p.endsWith(".json")) return "json";
  if (p.includes("document") || p.endsWith(".md")) return "document";
  return "other";
}

function daysBetween(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY);
}

function infoStatus(presence: PublishedPresence, path: string): InfoStatus {
  const file = presence.files.find((f) => path.endsWith(f.path) || f.path.endsWith(path));
  if (file && file.content.trim().length < 200) return "incomplete";
  const age = daysBetween(presence.updatedAt);
  if (age === null) return "review";
  if (age > 180) return "stale";
  if (age > 90) return "review";
  return "current";
}

function buildSeries(rows: Row[], period: InsightsPeriod): InsightsPoint[] {
  const byDay = new Map<string, InsightsPoint>();
  const days = period === "all" ? 90 : period;
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    byDay.set(date, { date, access: 0, clicks: 0 });
  }
  for (const row of rows) {
    const date = row.occurred_at.slice(0, 10);
    const point = byDay.get(date) ?? { date, access: 0, clicks: 0 };
    if (isClick(row)) point.clicks += 1;
    else point.access += 1;
    byDay.set(date, point);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function presenceState(presence: PublishedPresence, hasPendingUpdate: boolean): PresenceState {
  if (presence.status === "offline") return "offline";
  if (presence.subscriptionStatus && !["active", "trialing", "past_due"].includes(presence.subscriptionStatus)) {
    return "limited";
  }
  if (hasPendingUpdate) return "update_pending";
  return "online";
}

const IMPROVEMENT_QUESTIONS: Record<string, { question: string; why: string }> = {
  summary: {
    question: "Wie beschreibst du in ein bis drei Sätzen, was du anbietest?",
    why: "Diese Beschreibung wird in llms.txt und about.md veröffentlicht und von AI-Systemen zuerst gelesen.",
  },
  tagline: {
    question: "Welcher eine Satz beschreibt deine Positionierung am besten?",
    why: "Die Positionierung erscheint als kurze Einordnung in deinen veröffentlichten Dateien.",
  },
  faqs: {
    question: "Welche Frage stellen dir Interessierte am häufigsten – und wie lautet deine Antwort?",
    why: "Beantwortete Fragen werden in faq.md veröffentlicht und müssen nicht mehr geraten werden.",
  },
  facts: {
    question: "Welche Angabe kannst du als geprüften Fakt bestätigen?",
    why: "Bestätigte Fakten werden als Fakten veröffentlicht, unbestätigte bleiben als Anbieterangabe markiert.",
  },
  sources: {
    question: "Welche öffentliche URL soll Crawler auf Änderungen beobachten?",
    why: "Beobachtete Quellen zeigen dir, wenn deine veröffentlichten Angaben nicht mehr zu deiner Website passen.",
  },
  core: {
    question: "Welche Angabe deiner Knowledge Core ist nicht mehr aktuell?",
    why: "Aktuelle Angaben halten die veröffentlichten Antworten korrekt.",
  },
};

/** Fields `applyToCore` can publish directly after an explicit confirmation. */
const ANSWERABLE_FIELDS = ["summary", "tagline"];

export async function buildInsights(input: {
  presence: PublishedPresence;
  period: InsightsPeriod;
  maxDays: number;
  hasPendingUpdate?: boolean;
}): Promise<InsightsDashboard> {
  const { presence, period, maxDays } = input;
  const slug = presence.slug;

  const [current, previous] = await Promise.all([loadRows(slug, period, 0), loadRows(slug, period, 1)]);

  const accessNow = current.filter(isAccess).length;
  const accessBefore = previous.filter(isAccess).length;
  const readsNow = current.filter((r) => r.event_type === "file_read").length;
  const readsBefore = previous.filter((r) => r.event_type === "file_read").length;
  const clicksNow = current.filter(isClick).length;
  const clicksBefore = previous.filter(isClick).length;

  const series = buildSeries(current, period);
  const spark = series.slice(-14).map((p) => p.access);
  const clickSpark = series.slice(-14).map((p) => p.clicks);

  // Improvements
  let recommendations: {
    id: string;
    kind: string;
    fieldPath: string;
    currentValue: string | null;
    proposedValue: string | null;
    issue: string;
    evidence: string | null;
    expectedBenefit: string | null;
    affectedFiles: string[];
    createdAt: string;
    publishedAt: string | null;
    state: string;
  }[] = [];
  let published: typeof recommendations = [];
  try {
    const improvements = await import("../improvements.server");
    const sources = await import("../sources.server");
    const [approvedSources, openChanges] = await Promise.all([
      sources.listSources(slug).catch(() => []),
      sources.listOpenChanges(slug, 5).catch(() => []),
    ]);
    await improvements
      .detectRecommendations({
        slug,
        core: presence.core,
        approvedSources: approvedSources.length,
        openChanges: openChanges.map((c) => ({ id: c.id, summary: c.summary, evidence: c.evidence, url: c.url })),
      })
      .catch(() => undefined);
    recommendations = (await improvements.listRecommendations(slug)) as typeof recommendations;
    published = (await improvements.listRecommendations(slug, ["published", "approved", "publishing"])) as typeof recommendations;
  } catch {
    recommendations = [];
  }

  const accessesSince = (iso: string | null): number | null => {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return current.filter((r) => Date.parse(r.occurred_at) >= t && isAccess(r)).length;
  };

  const improvements: ImprovementEntry[] = published
    .map((r) => ({
      id: r.id,
      date: r.publishedAt ?? r.createdAt,
      area: r.fieldPath,
      before: r.currentValue,
      after: r.proposedValue,
      state: (r.state === "published" ? "published" : r.state === "publishing" ? "confirmed" : "draft") as ImprovementEntry["state"],
      measuredSince: accessesSince(r.publishedAt),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);

  const top = recommendations[0] ?? null;
  const meta = top ? IMPROVEMENT_QUESTIONS[top.fieldPath] ?? IMPROVEMENT_QUESTIONS["core"]! : null;
  const nextImprovement: NextImprovement | null =
    top && meta
      ? {
          id: top.id,
          title: top.issue,
          issue: top.issue,
          evidence: top.evidence,
          why: top.expectedBenefit ?? meta.why,
          fieldPath: top.fieldPath,
          currentValue: top.currentValue,
          proposedValue: top.proposedValue,
          affectedFiles: top.affectedFiles,
          answerable: ANSWERABLE_FIELDS.includes(top.fieldPath),
          question: meta.question,
        }
      : null;

  const kpis: InsightsKpi[] = [
    {
      key: "access",
      label: "Gemessene Zugriffe",
      value: accessNow,
      previous: period === "all" ? null : accessBefore,
      deltaPct: period === "all" ? null : pct(accessNow, accessBefore),
      spark,
      insufficient: accessNow === 0,
      tooltip:
        "Enthält von Crawler beobachtete Dateiabrufe, API-Zugriffe und unterstützte Tool-Interaktionen. Dies ist keine vollständige Messung aller Aktivitäten von ChatGPT oder anderen KI-Systemen.",
    },
    {
      key: "reads",
      label: "Gelesene Inhalte",
      value: readsNow,
      previous: period === "all" ? null : readsBefore,
      deltaPct: period === "all" ? null : pct(readsNow, readsBefore),
      spark: series.slice(-14).map((p) => p.access),
      insufficient: readsNow === 0,
      tooltip:
        "Abrufe deiner veröffentlichten Dateien (llms.txt, Markdown, JSON). Ein Abruf ist keine belegte Empfehlung oder Zitierung.",
    },
    {
      key: "clicks",
      label: "Ausgehende Klicks",
      value: clicksNow,
      previous: period === "all" ? null : clicksBefore,
      deltaPct: period === "all" ? null : pct(clicksNow, clicksBefore),
      spark: clickSpark,
      insufficient: clicksNow === 0,
      tooltip:
        "Klicks auf unterstützte, von Crawler erzeugte Weiterleitungslinks. Klicks außerhalb dieser Links können nicht gemessen werden.",
    },
    {
      key: "potential",
      label: "Verbesserungspotenzial",
      value: recommendations.length,
      previous: null,
      deltaPct: null,
      spark: [],
      unit: "open",
      insufficient: false,
      tooltip:
        "Offene, aus deiner Knowledge Core abgeleitete Verbesserungsvorschläge. Sie sind im laufenden Abo enthalten und kostenlos umsetzbar.",
    },
  ];

  // Top content
  const byPath = new Map<string, { count: number; last: string }>();
  const beforeByPath = new Map<string, number>();
  for (const row of current) {
    if (!row.resource_path) continue;
    const entry = byPath.get(row.resource_path) ?? { count: 0, last: row.occurred_at };
    entry.count += 1;
    if (row.occurred_at > entry.last) entry.last = row.occurred_at;
    byPath.set(row.resource_path, entry);
  }
  for (const row of previous) {
    if (!row.resource_path) continue;
    beforeByPath.set(row.resource_path, (beforeByPath.get(row.resource_path) ?? 0) + 1);
  }
  const topContent: TopContentRow[] = [...byPath.entries()]
    .map(([path, entry]) => {
      const kind = contentKind(path);
      return {
        path,
        label: path.split("/").filter(Boolean).slice(-1)[0] ?? path,
        kind,
        accesses: entry.count,
        deltaPct: period === "all" ? null : pct(entry.count, beforeByPath.get(path) ?? 0),
        lastAccessAt: entry.last,
        infoStatus: infoStatus(presence, path),
      };
    })
    .sort((a, b) => b.accesses - a.accesses)
    .slice(0, 12);

  // Sources
  const bySource = new Map<DetectedSource, number>();
  for (const row of current) {
    const s = detectSource(row);
    bySource.set(s, (bySource.get(s) ?? 0) + 1);
  }

  const events: EventRow[] = current
    .slice(-60)
    .reverse()
    .map((row) => ({
      at: row.occurred_at,
      type: row.event_type,
      content: row.resource_path,
      source: detectSource(row),
      outbound: isClick(row) ? (row.public_source_url ?? row.resource_path) : null,
    }));

  const updates: CoreUpdateMarkerLike[] = improvements
    .filter((i) => i.state === "published")
    .map((i) => ({
      date: i.date.slice(0, 10),
      area: i.area,
      description: i.after ? `Neuer Wert veröffentlicht: ${i.after.slice(0, 120)}` : "Knowledge Core aktualisiert",
      measuredSince: i.measuredSince,
    }));
  if (presence.updatedAt && !updates.some((u) => u.date === presence.updatedAt.slice(0, 10))) {
    updates.push({
      date: presence.updatedAt.slice(0, 10),
      area: "Knowledge Core",
      description: `Veröffentlichte Version ${presence.version}`,
      measuredSince: accessesSince(presence.updatedAt),
    });
  }

  return {
    slug,
    name: presence.core?.name || slug,
    state: presenceState(presence, Boolean(input.hasPendingUpdate)),
    publicUrl: `https://crawler.today/p/${slug}`,
    lastCheckedAt: presence.updatedAt ?? null,
    period,
    maxDays,
    kpis,
    series,
    updates,
    topContent,
    sources: [...bySource.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    events,
    nextImprovement,
    improvements,
    retention: {
      daysSincePublish: daysBetween(presence.publishedAt),
      publishedUpdates: presence.version ?? null,
      totalAccesses: accessNow,
      nextCheckAt: new Date(Date.now() + 7 * DAY).toISOString(),
    },
    empty: current.length === 0,
    demo: presence.mode === "demo",
    notice: MEASUREMENT_NOTICE,
  };
}

type CoreUpdateMarkerLike = { date: string; area: string; description: string; measuredSince: number | null };

export { CONTENT_KIND_LABEL };
