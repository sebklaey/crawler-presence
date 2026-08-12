/**
 * Measured analytics shared by the owner view and the team view. Same numbers,
 * same measurement rules — team members simply reach them with a team code.
 */
import type { ManageAnalytics } from "./manage.functions";

export async function teamAnalyticsFor(slug: string, plan: string): Promise<ManageAnalytics> {
  const { planById } = await import("./billing");
  const { asPlanId } = await import("./entitlements");
  const period = (planById(asPlanId(plan)).analyticsDays >= 90 ? 90 : 7) as 7 | 90;

  const { publicSummary, detailedSummary } = await import("./mcp/presence-analytics");
  const [summary, detail] = await Promise.all([publicSummary(slug, slug, period), detailedSummary(slug, period)]);

  const metrics = [
    {
      label: "Crawler conversations",
      value: summary?.conversations_mentioning ?? 0,
      hint: "Distinct anonymous Crawler sessions that mentioned this Presence",
    },
    { label: "Mention events", value: summary?.mention_events ?? 0, hint: "Crawler tool calls referencing this Presence" },
    { label: "Public reads", value: summary?.crawler_reads ?? 0, hint: "Observable reads of your public files" },
    { label: "Outbound clicks", value: detail?.outbound_clicks ?? 0, hint: "Trackable clicks on your links" },
  ];

  return {
    mode: metrics.some((m) => m.value > 0) ? "measured" : "empty",
    windowDays: period,
    metrics,
    topQuestions: (detail?.file_reads ?? []).slice(0, 6).map((f) => ({ label: f.path, count: f.count })),
    gaps: [],
  };
}
