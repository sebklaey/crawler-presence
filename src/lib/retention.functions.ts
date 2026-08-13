/**
 * Retention surface: health score, source monitoring and the improvement
 * workflow. Accountless — the recovery code is the only capability, exactly
 * like the rest of /manage. Nothing here changes a published Presence without
 * an explicit owner approval.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { HealthReason, HealthState } from "./health";
import type { Recommendation } from "./improvements.server";
import type { PresenceSource, SourceChange } from "./sources.server";

const codeSchema = z.object({ code: z.string().trim().min(10).max(200) });

type Failure = { ok: false; reason: "invalid-code" | "not-found" | "rate-limited" | "unavailable" };

async function resolve(code: string) {
  const { parseRecoveryCode, verifyManageSecret, allowRequest, PresenceStoreError } = await import("./mcp/presences");
  const parsed = parseRecoveryCode(code);
  if (!parsed) return { error: "invalid-code" } as const;
  try {
    if (!(await allowRequest(`manage:${parsed.slug}`, 20))) return { error: "rate-limited" } as const;
    const presence = await verifyManageSecret(parsed.slug, parsed.secret);
    if (!presence) return { error: "not-found" } as const;
    return { presence };
  } catch (error) {
    if (error instanceof PresenceStoreError) return { error: "unavailable" } as const;
    throw error;
  }
}

export type RetentionOverview =
  | Failure
  | {
      ok: true;
      slug: string;
      health: { score: number; state: HealthState; reasons: HealthReason[] };
      sources: PresenceSource[];
      changes: SourceChange[];
      recommendations: Recommendation[];
      scanFrequency: "daily" | "weekly" | "monthly";
      sourceLimit: number;
      /** How this score is built, shown verbatim to the owner. */
      explanation: string;
    };

const SOURCE_LIMIT: Record<string, number> = { plus: 1, pro: 5, business: 25 };

export const retentionOverviewFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => codeSchema.parse(input))
  .handler(async ({ data }): Promise<RetentionOverview> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const p = resolved.presence;

    const [{ computeHealth }, sourcesMod, improvements, analytics] = await Promise.all([
      import("./health"),
      import("./sources.server"),
      import("./improvements.server"),
      import("./mcp/presence-analytics"),
    ]);

    try {
      const [sources, changes, detail, accepted] = await Promise.all([
        sourcesMod.listSources(p.slug),
        sourcesMod.listOpenChanges(p.slug, 10),
        analytics.detailedSummary(p.slug, 30),
        improvements.countAccepted(p.slug),
      ]);

      await improvements.detectRecommendations({
        slug: p.slug,
        core: p.core,
        approvedSources: sources.length,
        openChanges: changes.map((c) => ({ id: c.id, summary: c.summary, evidence: c.evidence, url: c.url })),
      });
      const recommendations = await improvements.listRecommendations(p.slug);

      const measuredEvents30d =
        (detail?.outbound_clicks ?? 0) + (detail?.daily ?? []).reduce((sum, d) => sum + d.mentions + d.reads, 0);

      const health = computeHealth({
        core: p.core,
        published: true,
        status: p.status === "offline" ? "offline" : "live",
        subscriptionStatus: p.subscriptionStatus ?? null,
        mode: p.mode === "demo" ? "demo" : "live",
        approvedSources: sources.length,
        lastSourceScanAt: sources.map((s) => s.lastScannedAt).filter(Boolean).sort().at(-1) ?? null,
        openConflicts: changes.filter((c) => c.classification === "conflicting_fact").length,
        measuredEvents30d,
        acceptedImprovements: accepted,
        pendingRecommendations: recommendations.length,
        endpointsHealthy: p.status !== "offline",
      });

      return {
        ok: true,
        slug: p.slug,
        health,
        sources,
        changes,
        recommendations,
        scanFrequency: sourcesMod.SCAN_FREQUENCY_BY_PLAN[p.plan] ?? "monthly",
        sourceLimit: SOURCE_LIMIT[p.plan] ?? 1,
        explanation:
          "The score combines activation, freshness of your facts, approved sources, measured Crawler activity and billing state. Every line below shows the points it contributed and why. It reflects what Crawler can measure about your published Presence — not your ranking in any AI assistant.",
      };
    } catch (error) {
      const { logBestEffortFailure } = await import("./best-effort");
      logBestEffortFailure("retention-overview", error);
      return { ok: false, reason: "unavailable" };
    }
  });

export const addSourceFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    codeSchema.extend({ url: z.string().trim().min(4).max(400), label: z.string().trim().max(120).optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; source: PresenceSource } | Failure | { ok: false; reason: "rejected"; message: string }> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const p = resolved.presence;
    const { addSource, listSources } = await import("./sources.server");
    try {
      const existing = await listSources(p.slug);
      const limit = SOURCE_LIMIT[p.plan] ?? 1;
      if (existing.length >= limit) {
        return { ok: false, reason: "rejected", message: `Your plan monitors up to ${limit} source${limit === 1 ? "" : "s"}.` };
      }
      const source = await addSource({ slug: p.slug, url: data.url, label: data.label ?? null, plan: p.plan });
      return { ok: true, source };
    } catch (error) {
      return { ok: false, reason: "rejected", message: error instanceof Error ? error.message : "That URL could not be added." };
    }
  });

export const removeSourceFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => codeSchema.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true } | Failure> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const { removeSource } = await import("./sources.server");
    await removeSource(resolved.presence.slug, data.id);
    return { ok: true };
  });

/** Owner-triggered scan; the scheduled job does the same work on a plan cadence. */
export const scanSourcesFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => codeSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; scanned: number; changed: number } | Failure> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const { scanPresence } = await import("./sources.server");
    try {
      const outcomes = await scanPresence(resolved.presence.slug, { force: true });
      return { ok: true, scanned: outcomes.length, changed: outcomes.filter((o) => o.classification !== "no_change").length };
    } catch (error) {
      const { logBestEffortFailure } = await import("./best-effort");
      logBestEffortFailure("owner-source-scan", error);
      return { ok: false, reason: "unavailable" };
    }
  });

export const resolveChangeFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    codeSchema.extend({ id: z.string().uuid(), status: z.enum(["reviewed", "dismissed"]) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true } | Failure> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const { resolveChange } = await import("./sources.server");
    await resolveChange(resolved.presence.slug, data.id, data.status);
    return { ok: true };
  });

/**
 * The only path that can publish a recommendation. "approve" requires the
 * owner to supply the exact text being published, so Crawler never rewrites a
 * Presence on its own; "reject" and "postpone" simply record the decision.
 */
export const decideRecommendationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    codeSchema
      .extend({
        id: z.string().uuid(),
        decision: z.enum(["approve", "reject", "postpone"]),
        value: z.string().trim().max(4000).optional(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; published: boolean } | Failure | { ok: false; reason: "rejected"; message: string }> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const p = resolved.presence;
    const { getRecommendation, setRecommendationState, applyToCore } = await import("./improvements.server");

    const rec = await getRecommendation(p.slug, data.id);
    if (!rec) return { ok: false, reason: "not-found" };

    if (data.decision === "reject") {
      await setRecommendationState(p.slug, rec.id, "rejected", data.reason);
      return { ok: true, published: false };
    }
    if (data.decision === "postpone") {
      await setRecommendationState(p.slug, rec.id, "postponed");
      return { ok: true, published: false };
    }

    if (!data.value) {
      return { ok: false, reason: "rejected", message: "Approving requires the exact text to publish." };
    }

    try {
      const nextCore = applyToCore(p.core, rec, data.value);
      const { republishCore } = await import("./mcp/presences");
      await setRecommendationState(p.slug, rec.id, "publishing");
      await republishCore(p.slug, nextCore);
      await setRecommendationState(p.slug, rec.id, "published");
      return { ok: true, published: true };
    } catch (error) {
      await setRecommendationState(p.slug, rec.id, "review");
      return { ok: false, reason: "rejected", message: error instanceof Error ? error.message : "Publishing failed; nothing changed." };
    }
  });

export type NotificationPreferences = { sourceChanges: boolean; billing: boolean; reports: boolean; email: string | null };

export const notificationPreferencesFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    codeSchema
      .extend({
        sourceChanges: z.boolean().optional(),
        billing: z.boolean().optional(),
        reports: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; preferences: NotificationPreferences } | Failure> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const { db } = await import("./mcp/db.server");
    const supabase = db();
    if (!supabase) return { ok: false, reason: "unavailable" };

    const patch: Record<string, boolean> = {};
    if (data.sourceChanges !== undefined) patch["notify_source_changes"] = data.sourceChanges;
    if (data.billing !== undefined) patch["notify_billing"] = data.billing;
    if (data.reports !== undefined) patch["notify_reports"] = data.reports;
    if (Object.keys(patch).length) {
      await supabase.from("published_presences").update(patch).eq("slug", resolved.presence.slug);
    }

    const { data: row } = await supabase
      .from("published_presences")
      .select("notify_source_changes, notify_billing, notify_reports, report_email")
      .eq("slug", resolved.presence.slug)
      .maybeSingle();
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      preferences: {
        sourceChanges: r["notify_source_changes"] !== false,
        billing: r["notify_billing"] !== false,
        reports: r["notify_reports"] !== false,
        email: (r["report_email"] as string | null) ?? null,
      },
    };
  });
