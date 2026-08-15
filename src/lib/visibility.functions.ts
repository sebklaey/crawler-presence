/**
 * Server-Funktionen für AI Visibility Analytics.
 *
 * Zugriff kommt ausschließlich aus der verifizierten HttpOnly-Management-
 * Session (Cookie). Weder Code noch Slug aus dem Request sind Autorität.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const periodSchema = z.union([z.literal(7), z.literal(30), z.literal(90), z.literal("all")]).default(30);

export const visibilityDashboardFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        period: periodSchema,
        source: z.string().trim().max(40).optional(),
        eventType: z.string().trim().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireManagedPresence } = await import("./manage-presence.server");
    const auth = await requireManagedPresence({ write: false, rate: { name: "visibility", limit: 40 } });
    if ("error" in auth) return { ok: false as const, reason: auth.error };
    const presence = auth.presence;
    try {
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
    } catch {
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
    } catch {
      return { found: false as const };
    }
  });

/** Vollständiger Export der eigenen Analytics-Ereignisse (Datenportabilität). */
export const visibilityExportFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const { requireManagedPresence } = await import("./manage-presence.server");
    const auth = await requireManagedPresence({ write: true, rate: { name: "visibility-export", limit: 5 } });
    if ("error" in auth) return { ok: false as const };
    const presence = auth.presence;
    const { exportEvents } = await import("./visibility/admin.server");
    return { ok: true as const, export: await exportEvents(presence.slug) };
  });

/** Löscht alle Analytics-Ereignisse dieser Presence. */
export const visibilityPurgeFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const { requireManagedPresence } = await import("./manage-presence.server");
    const auth = await requireManagedPresence({ write: true, rate: { name: "visibility-purge", limit: 5 } });
    if ("error" in auth) return { ok: false as const };
    const presence = auth.presence;
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
    if (!(await allowRequest(`visibility-benchmark:${parsed.rateKey}`, 2)))
      return { ok: false as const, error: "Zu viele Benchmark-Läufe. Bitte später erneut versuchen." };
    const presence = await verifyManageSecret(parsed.slug, parsed.secret);
    if (!presence) return { ok: false as const, error: "Presence nicht gefunden." };
    const { runBenchmark } = await import("./visibility/benchmark.server");
    const result = await runBenchmark(presence.slug, presence.core?.name || presence.slug);
    if (result.error) return { ok: false as const, error: result.error };
    return { ok: true as const, runs: result.runs };
  });

/**
 * Connect or disconnect an analytics source (capability-based, recovery code only).
 * Stores nothing but a non-secret configuration value per source.
 */
export const visibilityConnectSourceFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().trim().min(10).max(200),
        source: z.enum(["authorized_ai", "public_web", "search_console", "visibility_benchmark", "user_reported"]),
        connected: z.boolean(),
        value: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { parseRecoveryCode, verifyManageSecret, allowRequest } = await import("./mcp/presences");
    const parsed = parseRecoveryCode(data.code);
    if (!parsed) return { ok: false as const, reason: "invalid-code" as const };
    if (!(await allowRequest(`visibility-connect:${parsed.rateKey}`, 20)))
      return { ok: false as const, reason: "rate-limited" as const };
    const presence = await verifyManageSecret(parsed.slug, parsed.secret);
    if (!presence) return { ok: false as const, reason: "not-found" as const };

    const { db } = await import("./mcp/db.server");
    const supabase = await db();
    if (!supabase) return { ok: false as const, reason: "unavailable" as const };

    const { error } = await supabase.from("analytics_integrations").upsert(
      {
        presence_slug: presence.slug,
        integration_type: data.source,
        connection_status: data.connected ? "connected" : "not_connected",
        configuration: data.value ? { value: data.value } : {},
        last_synced_at: data.connected ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "presence_slug,integration_type" },
    );
    if (error) return { ok: false as const, reason: "unavailable" as const };
    return { ok: true as const };
  });
