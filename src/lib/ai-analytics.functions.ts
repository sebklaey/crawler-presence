/**
 * Server functions for the AI analytics dashboard. Capability-based: the
 * recovery code is the only key, it is never logged and never put in a URL.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AiAnalyticsDashboard, AnalyticsPeriod } from "./analytics/model";

const periodSchema = z.union([z.literal(7), z.literal(30), z.literal(90), z.literal("all")]).default(30);
const codeSchema = z.string().trim().min(10).max(200);

export type AiAnalyticsResult =
  | { ok: false; reason: "invalid-code" | "not-found" | "rate-limited" | "unavailable" }
  | { ok: true; dashboard: AiAnalyticsDashboard };

type Presence = { slug: string; plan: string; core: Record<string, unknown> };

async function authorize(code: string, rateBudget = 60) {
  const { parseRecoveryCode, verifyManageSecret, allowRequest } = await import("./mcp/presences");
  const parsed = parseRecoveryCode(code);
  if (!parsed) return { ok: false as const, reason: "invalid-code" as const };
  if (!(await allowRequest(`ai-analytics:${parsed.rateKey}`, rateBudget))) {
    return { ok: false as const, reason: "rate-limited" as const };
  }
  const presence = await verifyManageSecret(parsed.slug, parsed.secret);
  if (!presence) return { ok: false as const, reason: "not-found" as const };
  return { ok: true as const, presence: presence as unknown as Presence };
}

function presenceName(presence: Presence): string {
  const name = presence.core?.["name"];
  return typeof name === "string" && name.trim() ? name.trim() : presence.slug;
}

function presenceCategory(presence: Presence): string {
  const category = presence.core?.["category"] ?? presence.core?.["entityType"];
  return typeof category === "string" && category.trim() ? category.trim() : "this category";
}

export const aiAnalyticsDashboardFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: codeSchema, period: periodSchema }).parse(input))
  .handler(async ({ data }): Promise<AiAnalyticsResult> => {
    const auth = await authorize(data.code);
    if (!auth.ok) return auth;
    try {
      const { buildAiAnalytics } = await import("./analytics/aggregate.server");
      const dashboard = await buildAiAnalytics({
        slug: auth.presence.slug,
        name: presenceName(auth.presence),
        plan: auth.presence.plan,
        period: data.period as AnalyticsPeriod,
      });
      return { ok: true, dashboard };
    } catch (error) {
      console.error("[crawler] ai analytics failed", error);
      return { ok: false, reason: "unavailable" };
    }
  });

export type ActionResult = { ok: boolean; message: string; errors?: string[] };

export type ConnectResult = ActionResult & { choices?: { value: string; label: string }[] };

function presenceWebsite(presence: Presence): string | null {
  const website = presence.core?.["website"];
  return typeof website === "string" && website.trim() ? website.trim() : null;
}

async function runProbesFor(presence: Presence): Promise<ActionResult> {
  const { runProbes } = await import("./analytics/probes.server");
  const domains = [presence.slug, "crawler.today"];
  const website = presenceWebsite(presence);
  if (website) {
    try {
      domains.push(new URL(website.startsWith("http") ? website : `https://${website}`).hostname);
    } catch {
      /* ignore malformed website */
    }
  }
  const result = await runProbes({
    slug: presence.slug,
    name: presenceName(presence),
    category: presenceCategory(presence),
    aliases: [presenceName(presence)],
    ownDomains: domains,
  });
  return { ok: result.succeeded > 0, message: result.message };
}

/**
 * One-click connect. Nothing has to be typed: Search Console uses the
 * workspace Google connection, the visibility tests use Crawler's built-in
 * test model. Only an ambiguous Search Console account returns a choice.
 */
export const connectAnalyticsSourceFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: codeSchema,
        source: z.enum(["search_console", "ai_probes"]),
        choice: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ConnectResult> => {
    const auth = await authorize(data.code, 20);
    if (!auth.ok) return { ok: false, message: "Access could not be verified." };
    const { upsertSource } = await import("./analytics/connectors.server");

    try {
      if (data.source === "ai_probes") {
        const { gatewayAvailable } = await import("./analytics/probes.server");
        if (!gatewayAvailable()) {
          return { ok: false, message: "The built-in test model is unavailable right now." };
        }
        await upsertSource(auth.presence.slug, "ai_probes", {
          status: "connected",
          configuration: { mode: "built_in" },
          last_error: null,
        });
        const run = await runProbesFor(auth.presence);
        return { ok: true, message: `Visibility tests connected. ${run.message}` };
      }

      const { gscGatewayAvailable, listGscProperties, pickProperty } = await import("./analytics/gsc-gateway.server");
      if (!gscGatewayAvailable()) {
        return { ok: false, message: "Search Console is not available for one-click connection." };
      }
      const listed = await listGscProperties();
      if (!listed.ok) return { ok: false, message: listed.error ?? "Search Console could not be reached." };
      if (!listed.properties.length) {
        return { ok: false, message: "The connected Google account has no verified Search Console property." };
      }

      let siteUrl = data.choice && listed.properties.some((p) => p.siteUrl === data.choice) ? data.choice : null;
      if (!siteUrl) siteUrl = pickProperty(listed.properties, presenceWebsite(auth.presence))?.siteUrl ?? null;
      if (!siteUrl) {
        return {
          ok: false,
          message: "Choose which Search Console property to connect.",
          choices: listed.properties.map((p) => ({ value: p.siteUrl, label: p.siteUrl })),
        };
      }

      await upsertSource(auth.presence.slug, "search_console", {
        configuration: { site_url: siteUrl },
        status: "connected",
        last_error: null,
      });
      const { syncSearchConsole } = await import("./analytics/connectors.server");
      const result = await syncSearchConsole(auth.presence.slug);
      return { ok: true, message: `Connected to ${siteUrl}. ${result.message}` };
    } catch (error) {
      console.error("[crawler] one-click connect failed", error);
      return { ok: false, message: "The connection failed. Nothing was changed." };
    }
  });

/** Saves a connector configuration (property ID / site URL). Never a secret. */
export const saveAnalyticsSourceFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: codeSchema,
        source: z.enum(["search_console"]),
        value: z.string().trim().max(300),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ActionResult> => {
    const auth = await authorize(data.code, 20);
    if (!auth.ok) return { ok: false, message: "Access could not be verified." };
    const { upsertSource } = await import("./analytics/connectors.server");
    await upsertSource(auth.presence.slug, data.source, {
      configuration: { site_url: data.value },
      status: data.value ? "connected" : "not_connected",
      last_error: null,
    });
    return { ok: true, message: data.value ? "Connection saved. Run a sync to import data." : "Connection removed." };
  });

/** Manually triggers a connector sync or a probe run. */
export const syncAnalyticsSourceFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ code: codeSchema, source: z.enum(["search_console", "ai_probes"]) }).parse(input),
  )
  .handler(async ({ data }): Promise<ActionResult> => {
    const auth = await authorize(data.code, 10);
    if (!auth.ok) return { ok: false, message: "Access could not be verified." };
    try {
      if (data.source === "search_console") {
        const { syncSearchConsole } = await import("./analytics/connectors.server");
        const result = await syncSearchConsole(auth.presence.slug);
        return { ok: result.ok, message: result.message };
      }
      const { runProbes } = await import("./analytics/probes.server");
      const domains = [auth.presence.slug, "crawler.today"];
      const website = auth.presence.core?.["website"];
      if (typeof website === "string" && website) {
        try {
          domains.push(new URL(website.startsWith("http") ? website : `https://${website}`).hostname);
        } catch {
          /* ignore malformed website */
        }
      }
      const result = await runProbes({
        slug: auth.presence.slug,
        name: presenceName(auth.presence),
        category: presenceCategory(auth.presence),
        aliases: [],
        ownDomains: domains,
      });
      return { ok: result.succeeded > 0, message: result.message };
    } catch (error) {
      console.error("[crawler] analytics sync failed", error);
      return { ok: false, message: "The sync failed. Nothing was changed." };
    }
  });

/** CSV export of the current dashboard rows. */
export const exportAnalyticsCsvFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: codeSchema, period: periodSchema }).parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; csv: string }> => {
    const auth = await authorize(data.code, 10);
    if (!auth.ok) return { ok: false, csv: "" };
    const { buildAiAnalytics } = await import("./analytics/aggregate.server");
    const dashboard = await buildAiAnalytics({
      slug: auth.presence.slug,
      name: presenceName(auth.presence),
      plan: auth.presence.plan,
      period: data.period as AnalyticsPeriod,
    });
    const header = "occurred_at,evidence,source,provider,surface,url,prompt,model,verified_bot";
    const lines = dashboard.citations.map((row) =>
      [
        row.occurredAt,
        row.evidence,
        row.source,
        row.provider,
        row.surface ?? "",
        row.url ?? "",
        row.prompt ?? "",
        row.model ?? "",
        row.verified ? "true" : "false",
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
    );
    return { ok: true, csv: [header, ...lines].join("\n") };
  });
