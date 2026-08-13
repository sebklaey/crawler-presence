/**
 * Freshness monitoring for owner-approved public source URLs.
 *
 * Rules that are not negotiable here:
 *  - Only URLs the owner approved are ever fetched.
 *  - HTTPS only, public hosts only, hard timeout and size limit, redirects
 *    re-validated at every hop (SSRF protection).
 *  - Fetched text is data, never instructions: it is stripped of markup and
 *    stored as a short excerpt plus a fingerprint. It is never executed and
 *    never fed to a model as a command (prompt-injection isolation).
 *  - A detected change never overwrites an owner-approved fact. It creates a
 *    recommendation that waits for review.
 */
import { db } from "./mcp/db.server";
import { assertPublicHttpsUrl, fetchPublicUrl } from "./url-guard";

export type ScanClassification =
  | "no_change"
  | "possible_new_fact"
  | "changed_fact"
  | "removed_fact"
  | "conflicting_fact"
  | "source_unavailable"
  | "source_stale"
  | "needs_review";

export type PresenceSource = {
  id: string;
  presenceSlug: string;
  url: string;
  label: string | null;
  scanFrequency: "daily" | "weekly" | "monthly";
  lastScannedAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
};

const MAX_BYTES = 512_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

/** Scan cadence by plan — more frequent monitoring is a paid capability. */
export const SCAN_FREQUENCY_BY_PLAN: Record<string, "daily" | "weekly" | "monthly"> = {
  plus: "monthly",
  pro: "weekly",
  business: "daily",
};

const FREQUENCY_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };

/* ------------------------------------------------------------------ */
/* SSRF protection                                                     */
/* ------------------------------------------------------------------ */

/** Rejects anything that is not a public https URL. */
export const assertSafeSourceUrl = assertPublicHttpsUrl;

export type FetchedSource = {
  ok: boolean;
  status: number | null;
  text: string;
  bytes: number;
  error?: string;
};

/** Fetches a source with manual redirect handling so every hop is revalidated. */
export async function fetchSource(rawUrl: string): Promise<FetchedSource> {
  const result = await fetchPublicUrl(rawUrl, {
    accept: "text/*, application/json",
    userAgent: "CrawlerFreshnessBot/1.0 (+https://crawler.today)",
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_BYTES,
    maxRedirects: MAX_REDIRECTS,
    allowedContentType: /text\/|json|xml/,
  });
  return {
    ok: result.ok,
    status: result.status,
    text: result.ok ? normalizeText(result.text) : "",
    bytes: result.bytes,
    ...(result.error ? { error: result.error } : {}),
  };
}

/**
 * Strips markup and collapses whitespace. The result is inert text used only
 * for comparison and for a short quoted excerpt shown to the owner.
 */
export function normalizeText(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fingerprint(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

function store() {
  const supabase = db();
  if (!supabase) throw new Error("The Crawler database is temporarily unavailable. Nothing was changed.");
  return supabase;
}

type SourceRow = {
  id: string;
  presence_slug: string;
  url: string;
  label: string | null;
  scan_frequency: string;
  last_scanned_at: string | null;
  last_status: string | null;
  last_error: string | null;
};

const fromRow = (r: SourceRow): PresenceSource => ({
  id: r.id,
  presenceSlug: r.presence_slug,
  url: r.url,
  label: r.label,
  scanFrequency: (["daily", "weekly", "monthly"].includes(r.scan_frequency) ? r.scan_frequency : "weekly") as
    | "daily"
    | "weekly"
    | "monthly",
  lastScannedAt: r.last_scanned_at,
  lastStatus: r.last_status,
  lastError: r.last_error,
});

const COLUMNS = "id, presence_slug, url, label, scan_frequency, last_scanned_at, last_status, last_error";

export async function listSources(slug: string): Promise<PresenceSource[]> {
  const { data, error } = await store().from("presence_sources").select(COLUMNS).eq("presence_slug", slug).order("created_at");
  if (error) throw new Error("Could not load your sources right now.");
  return ((data ?? []) as SourceRow[]).map(fromRow);
}

export async function addSource(input: { slug: string; url: string; label?: string | null; plan: string }): Promise<PresenceSource> {
  const url = assertSafeSourceUrl(input.url);
  const { data, error } = await store()
    .from("presence_sources")
    .insert({
      presence_slug: input.slug,
      url: url.toString(),
      label: input.label ?? null,
      scan_frequency: SCAN_FREQUENCY_BY_PLAN[input.plan] ?? "monthly",
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.code === "23505" ? "That source is already approved." : "Could not add that source.");
  return fromRow(data as SourceRow);
}

export async function removeSource(slug: string, id: string): Promise<void> {
  const { error } = await store().from("presence_sources").delete().eq("presence_slug", slug).eq("id", id);
  if (error) throw new Error("Could not remove that source.");
}

/* ------------------------------------------------------------------ */
/* Scanning                                                            */
/* ------------------------------------------------------------------ */

export type ScanOutcome = {
  sourceId: string;
  url: string;
  classification: ScanClassification;
  summary: string;
  evidence: string | null;
};

const excerptOf = (text: string) => text.slice(0, 600);

function dueFor(source: PresenceSource): boolean {
  if (!source.lastScannedAt) return true;
  const age = (Date.now() - Date.parse(source.lastScannedAt)) / 86_400_000;
  return !Number.isFinite(age) || age >= (FREQUENCY_DAYS[source.scanFrequency] ?? 7);
}

/**
 * Scans one approved source and records what changed. Nothing published is
 * modified: the outcome is a classified observation plus, when useful, a
 * recommendation the owner can review.
 */
export async function scanSource(source: PresenceSource, options?: { force?: boolean }): Promise<ScanOutcome | null> {
  if (!options?.force && !dueFor(source)) return null;
  const supabase = store();
  const result = await fetchSource(source.url);
  const now = new Date().toISOString();

  if (!result.ok) {
    await supabase
      .from("presence_sources")
      .update({ last_scanned_at: now, last_status: "unavailable", last_error: result.error ?? "Unavailable" })
      .eq("id", source.id);
    const outcome: ScanOutcome = {
      sourceId: source.id,
      url: source.url,
      classification: "source_unavailable",
      summary: `Source could not be read (${result.error ?? "unavailable"}).`,
      evidence: null,
    };
    await recordChange(source.presenceSlug, source.id, outcome);
    return outcome;
  }

  const print = await fingerprint(result.text);
  const { data: previous } = await supabase
    .from("source_snapshots")
    .select("fingerprint, excerpt")
    .eq("source_id", source.id)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("source_snapshots").insert({
    source_id: source.id,
    presence_slug: source.presenceSlug,
    fingerprint: print,
    excerpt: excerptOf(result.text),
    byte_size: result.bytes,
    http_status: result.status,
  });
  await supabase
    .from("presence_sources")
    .update({ last_scanned_at: now, last_status: "ok", last_error: null, consecutive_failures: 0 })
    .eq("id", source.id);

  if (!previous) {
    return {
      sourceId: source.id,
      url: source.url,
      classification: "no_change",
      summary: "First snapshot stored. Future scans compare against this baseline.",
      evidence: null,
    };
  }
  if ((previous as { fingerprint: string }).fingerprint === print) {
    return { sourceId: source.id, url: source.url, classification: "no_change", summary: "No meaningful change.", evidence: null };
  }

  const outcome: ScanOutcome = {
    sourceId: source.id,
    url: source.url,
    classification: "needs_review",
    summary: "The source text changed since the last scan.",
    evidence: excerptOf(result.text),
  };
  await recordChange(source.presenceSlug, source.id, outcome);
  return outcome;
}

async function recordChange(slug: string, sourceId: string, outcome: ScanOutcome): Promise<void> {
  const supabase = store();
  await supabase.from("source_changes").insert({
    source_id: sourceId,
    presence_slug: slug,
    classification: outcome.classification,
    summary: outcome.summary,
    evidence: outcome.evidence,
    status: "open",
  });
}

export type SourceChange = {
  id: string;
  classification: ScanClassification;
  summary: string;
  evidence: string | null;
  detectedAt: string;
  status: string;
  url: string | null;
};

export async function listOpenChanges(slug: string, limit = 20): Promise<SourceChange[]> {
  const { data, error } = await store()
    .from("source_changes")
    .select("id, classification, summary, evidence, detected_at, status, presence_sources(url)")
    .eq("presence_slug", slug)
    .eq("status", "open")
    .order("detected_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Could not load detected changes.");
  return ((data ?? []) as Record<string, any>[]).map((r) => ({
    id: r["id"] as string,
    classification: r["classification"] as ScanClassification,
    summary: r["summary"] as string,
    evidence: (r["evidence"] as string | null) ?? null,
    detectedAt: r["detected_at"] as string,
    status: r["status"] as string,
    url: (r["presence_sources"]?.url as string | undefined) ?? null,
  }));
}

export async function resolveChange(slug: string, id: string, status: "reviewed" | "dismissed"): Promise<void> {
  const { error } = await store()
    .from("source_changes")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("presence_slug", slug)
    .eq("id", id);
  if (error) throw new Error("Could not update that change.");
}

/** Scans every due source of one Presence. Idempotent: due-ness gates the work. */
export async function scanPresence(slug: string, options?: { force?: boolean }): Promise<ScanOutcome[]> {
  const sources = await listSources(slug);
  const outcomes: ScanOutcome[] = [];
  for (const source of sources) {
    const outcome = await scanSource(source, options);
    if (outcome) outcomes.push(outcome);
  }
  if (outcomes.length) {
    await store().from("published_presences").update({ last_source_scan_at: new Date().toISOString() }).eq("slug", slug);
  }
  return outcomes;
}
