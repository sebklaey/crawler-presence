/**
 * Server functions for the Insights dashboard. Authority is the verified
 * HttpOnly management cookie — never a recovery code from the request body.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { InsightsDashboard } from "./insights/model";

const periodSchema = z.union([z.literal(7), z.literal(30), z.literal(90), z.literal("all")]).default(30);

export type InsightsResult =
  | { ok: false; reason: "unauthenticated" | "csrf" | "not-found" | "rate-limited" | "unavailable" }
  | { ok: true; dashboard: InsightsDashboard };

export const insightsDashboardFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ period: periodSchema }).parse(input),
  )
  .handler(async ({ data }): Promise<InsightsResult> => {
    const { requireManagedPresence } = await import("./manage-presence.server");
    const auth = await requireManagedPresence({ write: false, rate: { name: "insights", limit: 60 } });
    if ("error" in auth) return { ok: false, reason: auth.error };
    const presence = auth.presence;
    try {

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
