/**
 * Server-Funktionen für AI Visibility Analytics.
 *
 * Zugriff ist rein capability-basiert: nur der gültige Management-Code der
 * jeweiligen Presence öffnet die detaillierten Analytics. Der Code wird nie
 * gespeichert, nie geloggt und nie in eine URL geschrieben.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const periodSchema = z.union([z.literal(7), z.literal(30), z.literal(90), z.literal("all")]).default(30);

export const visibilityDashboardFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().trim().min(10).max(200),
        period: periodSchema,
        source: z.string().trim().max(40).optional(),
        eventType: z.string().trim().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { parseRecoveryCode, verifyManageSecret, allowRequest } = await import("./mcp/presences");
    const parsed = parseRecoveryCode(data.code);
    if (!parsed) return { ok: false as const, reason: "invalid-code" as const };
    if (!(await allowRequest(`visibility:${parsed.slug}`, 40))) return { ok: false as const, reason: "rate-limited" as const };
    try {
      const presence = await verifyManageSecret(parsed.slug, parsed.secret);
      if (!presence) return { ok: false as const, reason: "not-found" as const };
      const { buildDashboard } = await import("./visibility/aggregate.server");
      const { planById } = await import("./billing");
      const { asPlanId } = await import("./entitlements");
      const allowed = planById(asPlanId(presence.plan)).analyticsDays;
      let period = data.period as 7 | 30 | 90 | "all";
      if (allowed < 3650) {
        if (period === "all") period = allowed >= 90 ? 90 : 7;
        else if (period > allowed) period = (allowed >= 90 ? 90 : allowed >= 30 ? 30 : 7) as 7 | 30 | 90;
      }
      const dashboard = await buildDashboard({
        slug: presence.slug,
        plan: presence.plan,
        period,
        source: (data.source ?? "all") as never,
        eventType: (data.eventType ?? "all") as never,
      });
      return { ok: true as const, dashboard, name: presence.core?.name ?? presence.slug, maxDays: allowed };
    } catch (error) {
      console.error(
        "[crawler] visibility dashboard failed",
        error instanceof Error ? error.message : String(error),
      );
      return { ok: false as const, reason: "unavailable" as const };
    }
  });

export const publicVisibilityFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ slug: z.string().trim().min(1).max(120), period: periodSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getPublished } = await import("./mcp/presences");
    try {
      const presence = await getPublished(data.slug);
      if (!presence) return { found: false as const };
      const { buildPublic } = await import("./visibility/aggregate.server");
      const summary = await buildPublic(presence.slug, data.period as 7 | 30 | 90 | "all");
      return { found: true as const, name: presence.core?.name ?? presence.slug, summary };
    } catch (error) {
      // "Not published" and "could not be read" look identical to a visitor
      // unless they are kept apart here.
      console.error(
        "[crawler] public visibility failed",
        error instanceof Error ? error.message : String(error),
      );
      return { found: false as const, unavailable: true as const };
    }
  });

/** Vollständiger Export der eigenen Analytics-Ereignisse (Datenportabilität). */
export const visibilityExportFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: z.string().trim().min(10).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { parseRecoveryCode, verifyManageSecret, allowRequest } = await import("./mcp/presences");
    const parsed = parseRecoveryCode(data.code);
    if (!parsed) return { ok: false as const };
    if (!(await allowRequest(`visibility-export:${parsed.slug}`, 5))) return { ok: false as const };
    const presence = await verifyManageSecret(parsed.slug, parsed.secret);
    if (!presence) return { ok: false as const };
    const { exportEvents } = await import("./visibility/admin.server");
    return { ok: true as const, export: await exportEvents(presence.slug) };
  });

/** Löscht alle Analytics-Ereignisse dieser Presence. */
export const visibilityPurgeFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: z.string().trim().min(10).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { parseRecoveryCode, verifyManageSecret, allowRequest } = await import("./mcp/presences");
    const parsed = parseRecoveryCode(data.code);
    if (!parsed) return { ok: false as const };
    if (!(await allowRequest(`visibility-purge:${parsed.slug}`, 5))) return { ok: false as const };
    const presence = await verifyManageSecret(parsed.slug, parsed.secret);
    if (!presence) return { ok: false as const };
    const { purgeEvents } = await import("./visibility/admin.server");
    await purgeEvents(presence.slug);
    return { ok: true as const };
  });

/** Startet den kontrollierten Benchmark-Lauf (keine reale Nutzermessung). */
export const visibilityBenchmarkFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: z.string().trim().min(10).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { parseRecoveryCode, verifyManageSecret, allowRequest } = await import("./mcp/presences");
    const parsed = parseRecoveryCode(data.code);
    if (!parsed) return { ok: false as const, error: "Ungültiger Recovery-Code." };
    if (!(await allowRequest(`visibility-benchmark:${parsed.slug}`, 2)))
      return { ok: false as const, error: "Zu viele Benchmark-Läufe. Bitte später erneut versuchen." };
    const presence = await verifyManageSecret(parsed.slug, parsed.secret);
    if (!presence) return { ok: false as const, error: "Presence nicht gefunden." };
    const { runBenchmark } = await import("./visibility/benchmark.server");
    const result = await runBenchmark(presence.slug, presence.core?.name || presence.slug);
    if (result.error) return { ok: false as const, error: result.error };
    return { ok: true as const, runs: result.runs };
  });
