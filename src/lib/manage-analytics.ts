/**
 * Measured Presence analytics shared by the owner view (recovery code) and the
 * team view (team code). Same numbers, same measurement rules.
 *
 * Only Crawler-observable activity is counted: Crawler-internal conversations
 * and queries, entity appearances, trackable outbound clicks and observable
 * reads of the published files. Crawler never sees private ChatGPT, Claude or
 * Gemini conversations.
 */
export type ManageAnalytics = {
  /** "measured" once real events exist, "empty" before the first event. */
  mode: "measured" | "empty";
  windowDays: number;
  metrics: { label: string; value: number; hint: string }[];
  topQuestions: { label: string; count: number }[];
  gaps: string[];
};

export async function analyticsFor(slug: string, plan: string): Promise<ManageAnalytics> {
  const { planById } = await import("./billing");
  const { asPlanId } = await import("./entitlements");
  const allowed = planById(asPlanId(plan)).analyticsDays;
  const period = (allowed >= 90 ? 90 : 7) as 7 | 90;

  const { publicSummary, detailedSummary } = await import("./mcp/presence-analytics");
  const [summary, detail] = await Promise.all([publicSummary(slug, slug, period), detailedSummary(slug, period)]);

  const metrics = [
    {
      label: "Crawler conversations",
      value: summary?.conversations_mentioning ?? 0,
      hint: "Distinct anonymous Crawler sessions that mentioned this Presence",
    },
    {
      label: "Mention events",
      value: summary?.mention_events ?? 0,
      hint: "Crawler tool calls referencing this Presence",
    },
    {
      label: "Public reads",
      value: summary?.crawler_reads ?? 0,
      hint: "Observable reads of your public files and Presence page",
    },
    {
      label: "Outbound clicks",
      value: detail?.outbound_clicks ?? 0,
      hint: "Trackable clicks on your links",
    },
  ];

  return {
    mode: metrics.some((m) => m.value > 0) ? "measured" : "empty",
    windowDays: period,
    metrics,
    topQuestions: (detail?.file_reads ?? []).slice(0, 6).map((f) => ({ label: f.path, count: f.count })),
    gaps: [],
  };
}
