/**
 * Scheduled retention work: scan approved sources on the plan cadence, persist
 * an explainable health score, and send at most one actionable notification
 * per Presence per run. Everything is idempotent — a retried run neither
 * rescans prematurely nor re-sends a message.
 */
import { db } from "./mcp/db.server";
import { computeHealth } from "./health";
import type { KnowledgeCore } from "./knowledge";
import { notify } from "./notifications.server";
import { detectRecommendations, countAccepted, listRecommendations } from "./improvements.server";
import { listOpenChanges, listSources, scanPresence } from "./sources.server";

const SITE = "https://crawler.today";

export type RetentionRunResult = {
  presences: number;
  scanned: number;
  changesDetected: number;
  notificationsSent: number;
};

export async function runRetentionMaintenance(): Promise<RetentionRunResult> {
  const supabase = db();
  if (!supabase) return { presences: 0, scanned: 0, changesDetected: 0, notificationsSent: 0 };

  const { data } = await supabase
    .from("published_presences")
    .select("slug, core, plan, mode, status, subscription_status, current_period_end")
    .eq("status", "live")
    .limit(200);

  const rows = (data ?? []) as Record<string, any>[];
  const result: RetentionRunResult = { presences: rows.length, scanned: 0, changesDetected: 0, notificationsSent: 0 };

  for (const row of rows) {
    const slug = row["slug"] as string;
    const core = row["core"] as KnowledgeCore;
    try {
      const outcomes = await scanPresence(slug);
      result.scanned += outcomes.length;
      const changed = outcomes.filter((o) => o.classification !== "no_change" && o.classification !== "source_stale");
      result.changesDetected += changed.length;

      const [sources, openChanges, accepted] = await Promise.all([
        listSources(slug),
        listOpenChanges(slug, 10),
        countAccepted(slug),
      ]);

      await detectRecommendations({
        slug,
        core,
        approvedSources: sources.length,
        openChanges: openChanges.map((c) => ({ id: c.id, summary: c.summary, evidence: c.evidence, url: c.url })),
      });
      const pending = await listRecommendations(slug);

      const health = computeHealth({
        core,
        published: true,
        status: "live",
        subscriptionStatus: (row["subscription_status"] as string | null) ?? null,
        mode: row["mode"] === "demo" ? "demo" : "live",
        approvedSources: sources.length,
        lastSourceScanAt: sources.map((s) => s.lastScannedAt).filter(Boolean).sort().at(-1) ?? null,
        openConflicts: openChanges.filter((c) => c.classification === "conflicting_fact").length,
        measuredEvents30d: 0,
        acceptedImprovements: accepted,
        pendingRecommendations: pending.length,
        endpointsHealthy: true,
      });

      await supabase.from("presence_health_scores").insert({
        presence_slug: slug,
        score: health.score,
        state: health.state,
        reasons: health.reasons,
      });

      // One message, one action. Source changes come first because they are
      // the only thing that can make published facts wrong.
      const unavailable = outcomes.find((o) => o.classification === "source_unavailable");
      if (changed.length) {
        const first = changed[0]!;
        const sent = await notify({
          slug,
          eventType: "source_change_detected",
          dedupeKey: `change:${slug}:${first.sourceId}:${new Date().toISOString().slice(0, 10)}`,
          subject: `A source of your Crawler Presence changed`,
          reason: "You approved this URL for monitoring and Crawler detected a change since the last scan.",
          body: [
            `${first.url} changed since Crawler last read it.`,
            "",
            first.summary,
            first.evidence ? `\n"${first.evidence.slice(0, 400)}…"` : "",
            "",
            "Your published Presence was not modified. Review the change and decide whether your facts need updating.",
          ].join("\n"),
          actionLabel: "Review the change",
          actionUrl: `${SITE}/manage`,
        });
        if (sent.sent) result.notificationsSent += 1;
      } else if (unavailable) {
        const sent = await notify({
          slug,
          eventType: "endpoint_unavailable",
          dedupeKey: `unavailable:${slug}:${unavailable.sourceId}:${new Date().toISOString().slice(0, 10)}`,
          subject: "Crawler could not read one of your sources",
          reason: "You approved this URL for monitoring and it did not respond during the scheduled scan.",
          body: `${unavailable.url} could not be read: ${unavailable.summary}\n\nYour published Presence is unaffected and stays online.`,
          actionLabel: "Check your sources",
          actionUrl: `${SITE}/manage`,
        });
        if (sent.sent) result.notificationsSent += 1;
      } else if (health.state === "at_risk" || health.state === "dormant") {
        const sent = await notify({
          slug,
          eventType: "fact_stale",
          dedupeKey: `health:${slug}:${health.state}:${new Date().toISOString().slice(0, 7)}`,
          subject: "Your Crawler Presence needs a short review",
          reason: `Crawler's monthly health check scored your Presence ${health.score}/100.`,
          body: [
            `Health score: ${health.score}/100 (${health.state.replace("_", " ")}).`,
            "",
            ...health.reasons.filter((r) => r.points < r.max).slice(0, 3).map((r) => `- ${r.label}: ${r.detail}`),
            "",
            "This score describes what Crawler can measure about your published Presence. It is not a ranking in any AI assistant.",
          ].join("\n"),
          actionLabel: "Open your Presence",
          actionUrl: `${SITE}/manage`,
        });
        if (sent.sent) result.notificationsSent += 1;
      }
    } catch (error) {
      console.error("[crawler] retention run failed for", slug, error instanceof Error ? error.message : "unknown");
    }
  }

  return result;
}
