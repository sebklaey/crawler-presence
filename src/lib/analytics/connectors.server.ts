/**
 * Connectors for attributed data sources.
 *
 * Every connector is fully implemented but honest: when credentials or a
 * property are missing it reports `not_connected` with a setup hint instead
 * of inventing numbers. No connector ever writes demo data.
 */
import { GSC_SCOPE, googleAccessToken, serviceAccount } from "./google-auth.server";
import type { ConnectorStatus, SourceType } from "./model";

type RuntimeGlobals = typeof globalThis & { process?: { env?: Record<string, string | undefined> } };

function env(name: string): string | undefined {
  return (globalThis as RuntimeGlobals).process?.env?.[name]?.trim() || undefined;
}

async function client() {
  try {
    const { db } = await import("../mcp/db.server");
    return db();
  } catch {
    return null;
  }
}

export type SourceRecord = {
  source_type: SourceType;
  status: ConnectorStatus;
  configuration: Record<string, unknown>;
  last_synced_at: string | null;
  next_sync_at: string | null;
  last_error: string | null;
  records_imported: number;
};

export async function listSources(slug: string): Promise<SourceRecord[]> {
  const supabase = await client();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("analytics_sources")
    .select("source_type, status, configuration, last_synced_at, next_sync_at, last_error, records_imported")
    .eq("presence_slug", slug);
  if (error) {
    console.error("[crawler] analytics sources read failed", error.message);
    return [];
  }
  return (data ?? []) as SourceRecord[];
}

export async function upsertSource(
  slug: string,
  sourceType: SourceType,
  patch: Partial<SourceRecord>,
): Promise<void> {
  const supabase = await client();
  if (!supabase) return;
  const { error } = await supabase
    .from("analytics_sources")
    .upsert(
      { presence_slug: slug, source_type: sourceType, updated_at: new Date().toISOString(), ...patch },
      { onConflict: "presence_slug,source_type" },
    );
  if (error) console.error("[crawler] analytics source upsert failed", error.message);
}

async function logSync(
  slug: string,
  sourceType: SourceType,
  result: { status: string; read: number; written: number; skipped: number; error?: string | null; from?: string; to?: string },
): Promise<void> {
  const supabase = await client();
  if (!supabase) return;
  await supabase.from("analytics_connector_syncs").insert({
    presence_slug: slug,
    source_type: sourceType,
    finished_at: new Date().toISOString(),
    status: result.status,
    window_start: result.from ?? null,
    window_end: result.to ?? null,
    records_read: result.read,
    records_written: result.written,
    records_skipped: result.skipped,
    error: result.error ?? null,
  });
}

export type SyncResult = { ok: boolean; written: number; skipped: number; message: string };

/** Known AI referral domains, editable in the database without a deploy. */
export async function aiReferralDomains(): Promise<{ domain: string; provider: string; surface: string | null }[]> {
  const supabase = await client();
  if (!supabase) return [];
  const { data } = await supabase
    .from("ai_referral_domains")
    .select("domain, provider, surface")
    .eq("active", true);
  return (data ?? []) as { domain: string; provider: string; surface: string | null }[];
}

/* ------------------------------------------------------------------ */
/* Search Console — classic Google search visibility                   */
/* ------------------------------------------------------------------ */


/**
 * Pulls impressions, clicks, CTR and average position. This is classic Google
 * search visibility and must never be labelled as AI mentions.
 */
/** Writes Search Console rows as attributed events. Duplicates are skipped. */
async function writeGscRows(slug: string, rows: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[]): Promise<number> {
  const supabase = await client();
  if (!supabase) return 0;
  let written = 0;
  for (const row of rows) {
    const [date, query, page, country, device] = row.keys;
    const { error } = await supabase.from("analytics_events").insert({
      presence_slug: slug,
      event_type: "search_impression",
      source_type: "search_console",
      evidence_type: "attributed",
      occurred_at: `${date}T12:00:00Z`,
      provider: "google",
      surface: "Google Search",
      path: page ?? null,
      region: country ?? null,
      idempotency_key: `gsc:${slug}:${date}:${query}:${page}`.slice(0, 80),
      metadata: {
        query,
        device,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      },
    });
    if (!error) written += 1;
  }
  return written;
}

export async function syncSearchConsole(slug: string, days = 90): Promise<SyncResult> {
  const sources = await listSources(slug);
  const config = sources.find((s) => s.source_type === "search_console")?.configuration ?? {};
  const siteUrl = String(config["site_url"] ?? env("SEARCH_CONSOLE_SITE_URL") ?? "");

  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  // One-click path: the workspace Search Console connection already carries
  // the Google authorisation, so nothing has to be entered by hand.
  const { gscGatewayAvailable, queryGscAnalytics } = await import("./gsc-gateway.server");
  if (siteUrl && gscGatewayAvailable()) {
    const result = await queryGscAnalytics(siteUrl, from, to);
    if (!result.ok) {
      await upsertSource(slug, "search_console", { status: "error", last_error: result.error ?? null });
      await logSync(slug, "search_console", { status: "error", read: 0, written: 0, skipped: 0, error: result.error ?? null, from, to });
      return { ok: false, written: 0, skipped: 0, message: result.error ?? "Search Console request failed." };
    }
    const written = await writeGscRows(slug, result.rows);
    await upsertSource(slug, "search_console", {
      status: "connected",
      last_synced_at: new Date().toISOString(),
      next_sync_at: new Date(Date.now() + 86_400_000).toISOString(),
      last_error: null,
      records_imported: written,
    });
    await logSync(slug, "search_console", { status: "success", read: result.rows.length, written, skipped: result.rows.length - written, from, to });
    return { ok: true, written, skipped: result.rows.length - written, message: `Search Console sync complete: ${written} rows.` };
  }

  const token = await googleAccessToken(GSC_SCOPE);

  if (!token || !siteUrl) {
    await upsertSource(slug, "search_console", { status: "not_connected", last_error: null });
    return {
      ok: false,
      written: 0,
      skipped: 0,
      message: "Search Console is not connected: choose a verified property to connect it.",
    };
  }



  try {
    const response = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          startDate: from,
          endDate: to,
          dimensions: ["date", "query", "page", "country", "device"],
          rowLimit: 5000,
        }),
      },
    );
    if (!response.ok) {
      const text = (await response.text()).slice(0, 300);
      await upsertSource(slug, "search_console", { status: "error", last_error: `GSC [${response.status}]: ${text}` });
      await logSync(slug, "search_console", { status: "error", read: 0, written: 0, skipped: 0, error: text, from, to });
      return { ok: false, written: 0, skipped: 0, message: `Search Console request failed [${response.status}].` };
    }
    const body = (await response.json()) as {
      rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
    };
    const supabase = await client();
    let written = 0;
    let skipped = 0;
    for (const row of body.rows ?? []) {
      const [date, query, page, country, device] = row.keys;
      const idempotencyKey = `gsc:${slug}:${date}:${query}:${page}`.slice(0, 80);
      const { error } = await supabase!.from("analytics_events").insert({
        presence_slug: slug,
        event_type: "search_impression",
        source_type: "search_console",
        evidence_type: "attributed",
        occurred_at: `${date}T12:00:00Z`,
        provider: "google",
        surface: "Google Search",
        path: page ?? null,
        region: country ?? null,
        idempotency_key: idempotencyKey,
        metadata: {
          query,
          device,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        },
      });
      if (!error) written += 1;
      else skipped += 1;
    }
    await upsertSource(slug, "search_console", {
      status: "connected",
      last_synced_at: new Date().toISOString(),
      next_sync_at: new Date(Date.now() + 86_400_000).toISOString(),
      last_error: null,
      records_imported: written,
    });
    await logSync(slug, "search_console", { status: "success", read: body.rows?.length ?? 0, written, skipped, from, to });
    return { ok: true, written, skipped, message: `Search Console sync complete: ${written} rows.` };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "unknown error";
    await upsertSource(slug, "search_console", { status: "error", last_error: message });
    return { ok: false, written: 0, skipped: 0, message: `Search Console sync failed: ${message}` };
  }
}

/* ------------------------------------------------------------------ */
/* Credential presence (never returns the secret itself)               */
/* ------------------------------------------------------------------ */

export function credentialStatus(): Record<SourceType, boolean> {
  return {
    crawler_observed: true,
    server_logs: true,
    
    search_console: Boolean(serviceAccount() || (env("LOVABLE_API_KEY") && env("GOOGLE_SEARCH_CONSOLE_API_KEY"))),
    ai_probes: Boolean(
      env("LOVABLE_API_KEY") ||
        env("OPENAI_API_KEY") ||
        env("ANTHROPIC_API_KEY") ||
        env("GEMINI_API_KEY") ||
        env("PERPLEXITY_API_KEY"),
    ),
  };
}
