/**
 * Export, Löschung und Aufbewahrung der Analytics-Ereignisse einer Presence.
 * Nur mit gültigem Management-Code erreichbar (siehe visibility.functions.ts).
 */
import type { SourceType } from "./model";

/** Standard-Aufbewahrung; konfigurierbar über die Integration-Konfiguration. */
export const DEFAULT_RETENTION_DAYS = 396;

async function db() {
  const { db } = await import("../mcp/db.server");
  return db();
}

export type AnalyticsExport = {
  slug: string;
  exported_at: string;
  retention_days: number;
  events: {
    occurred_at: string;
    event_type: string;
    source_type: SourceType | string;
    resource_path: string | null;
    referrer_category: string | null;
    public_source_url: string | null;
  }[];
  benchmarks: {
    tested_at: string;
    provider: string;
    model: string;
    prompt_key: string;
    prompt_version: string;
    entity_mentioned: boolean;
    description_correct: boolean | null;
    source_cited: boolean;
    position: number | null;
    detected_issues: string[];
    result_summary: string | null;
  }[];
  note: string;
};

export async function exportEvents(slug: string): Promise<AnalyticsExport> {
  const supabase = await db();
  const empty: AnalyticsExport = {
    slug,
    exported_at: new Date().toISOString(),
    retention_days: DEFAULT_RETENTION_DAYS,
    events: [],
    benchmarks: [],
    note: "Enthält ausschließlich minimierte Ereignisdaten. Keine Prompts, Antworten, Namen, E-Mail-Adressen oder IP-Adressen.",
  };
  if (!supabase) return empty;

  const [legacy, modern, benchmarks] = await Promise.all([
    supabase
      .from("presence_analytics_events")
      .select("occurred_at, event_type, source, file_path")
      .eq("presence_slug", slug)
      .limit(20000),
    supabase
      .from("analytics_events")
      .select("occurred_at, event_type, source_type, resource_path, referrer_category, public_source_url")
      .eq("presence_slug", slug)
      .limit(20000),
    supabase
      .from("visibility_benchmarks")
      .select(
        "tested_at, provider, model, prompt_key, prompt_version, entity_mentioned, description_correct, source_cited, position, detected_issues, result_summary",
      ).eq("presence_slug", slug).limit(2000),
  ]);

  const events = [
    ...((legacy.data ?? []) as { occurred_at: string; event_type: string; source: string; file_path: string | null }[]).map(
      (r) => ({
        occurred_at: r.occurred_at,
        event_type: r.event_type,
        source_type: r.event_type === "file_read" ? "presence_read" : "crawler_internal",
        resource_path: r.file_path,
        referrer_category: r.source,
        public_source_url: null,
      }),
    ),
    ...((modern.data ?? []) as AnalyticsExport["events"]),
  ].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  return { ...empty, events, benchmarks: (benchmarks.data ?? []) as AnalyticsExport["benchmarks"] };
}

export async function purgeEvents(slug: string): Promise<void> {
  const supabase = await db();
  if (!supabase) return;
  await Promise.all([
    supabase.from("analytics_events").delete().eq("presence_slug", slug),
    supabase.from("presence_analytics_events").delete().eq("presence_slug", slug),
    supabase.from("analytics_daily_rollups").delete().eq("presence_slug", slug),
  ]);
}

/** Aufbewahrungsfrist anwenden: ältere Ereignisse werden entfernt. */
export async function applyRetention(days = DEFAULT_RETENTION_DAYS): Promise<void> {
  const supabase = await db();
  if (!supabase) return;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  await supabase.from("analytics_events").delete().lt("occurred_at", cutoff);
}
