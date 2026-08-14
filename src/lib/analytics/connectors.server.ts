/**
 * Connectors for attributed data sources.
 *
 * Every connector is fully implemented but honest: when credentials or a
 * property are missing it reports `not_connected` with a setup hint instead
 * of inventing numbers. No connector ever writes demo data.
 */
import { GA4_SCOPE, GSC_SCOPE, googleAccessToken, serviceAccount } from "./google-auth.server";
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
/* GA4 — attributed AI referral traffic                                */
/* ------------------------------------------------------------------ */

export function ga4Configured(config: Record<string, unknown>): boolean {
  return Boolean(serviceAccount() && (config["property_id"] || env("GA4_PROPERTY_ID")));
}

/**
 * Pulls AI-referral sessions from the GA4 Data API. GA4 only sees visitors
 * that clicked a link, so the result is stored as `attributed`, never as a
 * mention count.
 */
export async function syncGa4(slug: string, days = 90): Promise<SyncResult> {
  const sources = await listSources(slug);
  const config = sources.find((s) => s.source_type === "ga4")?.configuration ?? {};
  const propertyId = String(config["property_id"] ?? env("GA4_PROPERTY_ID") ?? "").replace(/^properties\//, "");
  const token = await googleAccessToken(GA4_SCOPE);

  if (!token || !propertyId) {
    await upsertSource(slug, "ga4", {
      status: "not_connected",
      last_error: null,
    });
    return { ok: false, written: 0, skipped: 0, message: "GA4 is not connected: service account or property ID missing." };
  }

  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  try {
    const response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: from, endDate: to }],
          dimensions: [
            { name: "date" },
            { name: "sessionSource" },
            { name: "landingPage" },
            { name: "country" },
            { name: "language" },
          ],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "engagedSessions" },
            { name: "conversions" },
          ],
          limit: 10000,
        }),
      },
    );
    if (!response.ok) {
      const text = (await response.text()).slice(0, 300);
      await upsertSource(slug, "ga4", { status: "error", last_error: `GA4 [${response.status}]: ${text}` });
      await logSync(slug, "ga4", { status: "error", read: 0, written: 0, skipped: 0, error: text, from, to });
      return { ok: false, written: 0, skipped: 0, message: `GA4 request failed [${response.status}].` };
    }

    const body = (await response.json()) as {
      rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
    };
    const referrals = await aiReferralDomains();
    const supabase = await client();
    let written = 0;
    let skipped = 0;

    for (const row of body.rows ?? []) {
      const [date, source, landing, country, language] = row.dimensionValues.map((d) => d.value);
      const host = (source ?? "").toLowerCase().replace(/^www\./, "");
      const match = referrals.find((r) => host === r.domain || host.endsWith(`.${r.domain}`));
      if (!match) {
        skipped += 1;
        continue;
      }
      const sessions = Number(row.metricValues[0]?.value ?? 0);
      const occurredAt = `${(date ?? "").slice(0, 4)}-${(date ?? "").slice(4, 6)}-${(date ?? "").slice(6, 8)}T12:00:00Z`;
      const idempotencyKey = `ga4:${slug}:${date}:${host}:${landing}`.slice(0, 80);
      const { error } = await supabase!.from("analytics_events").insert({
        presence_slug: slug,
        event_type: "ai_referral_session",
        source_type: "ga4",
        evidence_type: "attributed",
        occurred_at: occurredAt,
        provider: match.provider,
        surface: match.surface,
        path: landing ?? null,
        referrer: host,
        region: country ?? null,
        locale: language ?? null,
        idempotency_key: idempotencyKey,
        metadata: {
          sessions,
          users: Number(row.metricValues[1]?.value ?? 0),
          engaged_sessions: Number(row.metricValues[2]?.value ?? 0),
          conversions: Number(row.metricValues[3]?.value ?? 0),
        },
      });
      if (error && error.code !== "23505") skipped += 1;
      else if (!error) written += 1;
      else skipped += 1;
    }

    await upsertSource(slug, "ga4", {
      status: "connected",
      last_synced_at: new Date().toISOString(),
      next_sync_at: new Date(Date.now() + 86_400_000).toISOString(),
      last_error: null,
      records_imported: written,
    });
    await logSync(slug, "ga4", { status: "success", read: body.rows?.length ?? 0, written, skipped, from, to });
    return { ok: true, written, skipped, message: `GA4 sync complete: ${written} attributed rows.` };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "unknown error";
    await upsertSource(slug, "ga4", { status: "error", last_error: message });
    await logSync(slug, "ga4", { status: "error", read: 0, written: 0, skipped: 0, error: message });
    return { ok: false, written: 0, skipped: 0, message: `GA4 sync failed: ${message}` };
  }
}

/* ------------------------------------------------------------------ */
/* Search Console — classic Google search visibility                   */
/* ------------------------------------------------------------------ */

/**
 * Pulls impressions, clicks, CTR and average position. This is classic Google
 * search visibility and must never be labelled as AI mentions.
 */
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
      await logSync(slug, "search_console", { status: "error", read: 0, written: 0, skipped: 0, error: result.error, from, to });
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
/* Bing AI performance — validated CSV import                          */
/* ------------------------------------------------------------------ */

export type CsvRow = { date: string; url: string; query: string | null; surface: string | null; citations: number };

/**
 * Parses the Bing Webmaster Tools AI performance export. Microsoft publishes
 * no documented public API for this data, so Crawler imports the official CSV
 * instead of inventing an endpoint.
 */
export function parseBingCsv(text: string): { rows: CsvRow[]; errors: string[] } {
  const errors: string[] = [];
  const rows: CsvRow[] = [];
  const lines = text.trim().split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { rows, errors: ["The file is empty."] };

  const header = (lines[0] ?? "").split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const index = (...names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const dateAt = index("date", "day");
  const urlAt = index("url", "page", "cited url");
  const queryAt = index("query", "grounding query", "search query");
  const surfaceAt = index("surface", "ai surface", "experience");
  const countAt = index("citations", "clicks", "count", "impressions");

  if (dateAt < 0 || urlAt < 0) {
    return { rows, errors: ["The CSV needs at least a 'Date' and a 'URL' column."] };
  }

  for (let i = 1; i < lines.length; i += 1) {
    const cells = (lines[i] ?? "").split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const date = cells[dateAt] ?? "";
    const url = cells[urlAt] ?? "";
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
      errors.push(`Row ${i + 1}: invalid date "${date}".`);
      continue;
    }
    if (!/^https?:\/\//i.test(url)) {
      errors.push(`Row ${i + 1}: invalid URL "${url}".`);
      continue;
    }
    const count = countAt >= 0 ? Number(cells[countAt] ?? "1") : 1;
    rows.push({
      date: date.slice(0, 10),
      url,
      query: queryAt >= 0 ? (cells[queryAt] ?? null) : null,
      surface: surfaceAt >= 0 ? (cells[surfaceAt] ?? null) : null,
      citations: Number.isFinite(count) && count > 0 ? Math.round(count) : 1,
    });
  }
  return { rows, errors };
}

/** Imports a validated Bing CSV. Re-importing the same file changes nothing. */
export async function importBingCsv(slug: string, text: string): Promise<SyncResult & { errors: string[] }> {
  const { rows, errors } = parseBingCsv(text);
  const supabase = await client();
  if (!supabase) return { ok: false, written: 0, skipped: 0, message: "Storage unavailable.", errors };
  if (!rows.length) {
    return { ok: false, written: 0, skipped: 0, message: "No valid rows found in the file.", errors };
  }

  let written = 0;
  let skipped = 0;
  for (const row of rows) {
    const { error } = await supabase.from("analytics_events").insert({
      presence_slug: slug,
      event_type: "observed_citation",
      source_type: "bing_csv",
      evidence_type: "observed",
      occurred_at: `${row.date}T12:00:00Z`,
      provider: "microsoft",
      surface: row.surface ?? "Bing / Copilot",
      citation_url: row.url,
      path: row.url,
      idempotency_key: `bing:${slug}:${row.date}:${row.url}:${row.query ?? ""}`.slice(0, 80),
      metadata: { query: row.query, citations: row.citations, import_origin: "bing_webmaster_csv" },
    });
    if (!error) written += 1;
    else skipped += 1;
  }

  await upsertSource(slug, "bing_csv", {
    status: "connected",
    last_synced_at: new Date().toISOString(),
    last_error: errors.length ? `${errors.length} rows rejected` : null,
    records_imported: written,
  });
  await logSync(slug, "bing_csv", { status: "success", read: rows.length, written, skipped });

  return {
    ok: true,
    written,
    skipped,
    message: `Imported ${written} citations, ${skipped} duplicates skipped.`,
    errors: errors.slice(0, 20),
  };
}

/* ------------------------------------------------------------------ */
/* Credential presence (never returns the secret itself)               */
/* ------------------------------------------------------------------ */

export function credentialStatus(): Record<SourceType, boolean> {
  return {
    crawler_observed: true,
    server_logs: true,
    ga4: Boolean(serviceAccount()),
    search_console: Boolean(serviceAccount()),
    bing_csv: true,
    ai_probes: Boolean(
      env("OPENAI_API_KEY") || env("ANTHROPIC_API_KEY") || env("GEMINI_API_KEY") || env("PERPLEXITY_API_KEY"),
    ),
  };
}
