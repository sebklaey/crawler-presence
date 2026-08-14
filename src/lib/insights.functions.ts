/**
 * Server functions for the Insights dashboard. Capability-based: the recovery
 * code is the only key, it is never logged and never written into a URL.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { InsightsDashboard } from "./insights/model";

const periodSchema = z.union([z.literal(7), z.literal(30), z.literal(90), z.literal("all")]).default(30);

export type InsightsResult =
  | { ok: false; reason: "invalid-code" | "not-found" | "rate-limited" | "unavailable" }
  | { ok: true; dashboard: InsightsDashboard };

export const insightsDashboardFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ code: z.string().trim().min(10).max(200), period: periodSchema }).parse(input),
  )
  .handler(async ({ data }): Promise<InsightsResult> => {
    const { parseRecoveryCode, verifyManageSecret, allowRequest } = await import("./mcp/presences");
    const parsed = parseRecoveryCode(data.code);
    if (!parsed) return { ok: false, reason: "invalid-code" };
    if (!(await allowRequest(`insights:${parsed.slug}`, 60))) return { ok: false, reason: "rate-limited" };
    try {
      const presence = await verifyManageSecret(parsed.slug, parsed.secret);
      if (!presence) return { ok: false, reason: "not-found" };

      const { planById } = await import("./billing");
      const { asPlanId } = await import("./entitlements");
      const allowed = planById(asPlanId(presence.plan)).analyticsDays;
      let period = data.period as 7 | 30 | 90 | "all";
      if (allowed < 3650) {
        if (period === "all") period = allowed >= 90 ? 90 : 7;
        else if (period > allowed) period = (allowed >= 90 ? 90 : allowed >= 30 ? 30 : 7) as 7 | 30 | 90;
      }

      const { buildInsights } = await import("./insights/build.server");
      const dashboard = await buildInsights({ presence, period, maxDays: allowed });
      return { ok: true, dashboard };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  });
