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
import { logBestEffortFailure } from "./best-effort";
import { db } from "./mcp/db.server";

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

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "169.254.169.254"]);

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b].some((n) => Number.isNaN(n) || n > 255)) return true;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** Rejects anything that is not a public https URL. */
export function assertSafeSourceUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That is not a valid URL.");
  }
  if (url.protocol !== "https:") throw new Error("Only https:// source URLs are allowed.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host)) throw new Error("That host is not allowed.");
  if (host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    throw new Error("Only public hostnames are allowed.");
  }
  if (isPrivateIPv4(host)) throw new Error("Private network addresses are not allowed.");
  if (host.includes(":") || host === "::1") throw new Error("Raw IPv6 addresses are not allowed.");
  if (url.username || url.password) throw new Error("Credentials in the URL are not allowed.");
  return url;
}

export type FetchedSource = {
  ok: boolean;
  status: number | null;
  text: string;
  bytes: number;
  error?: string;
};

/** Fetches a source with manual redirect handling so every hop is revalidated. */
export async function fetchSource(rawUrl: string): Promise<FetchedSource> {
  let current = assertSafeSourceUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "CrawlerFreshnessBot/1.0 (+https://crawler.today)", accept: "text/*, application/json" },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return { ok: false, status: res.status, text: "", bytes: 0, error: "Redirect without target" };
        current = assertSafeSourceUrl(new URL(location, current).toString());
        continue;
      }

      if (!res.ok) return { ok: false, status: res.status, text: "", bytes: 0, error: `HTTP ${res.status}` };

      const type = res.headers.get("content-type") ?? "";
      if (!/text\/|json|xml/.test(type)) {
        return { ok: false, status: res.status, text: "", bytes: 0, error: `Unsupported content type: ${type}` };
      }

      const raw = await res.text();
      const clipped = raw.slice(0, MAX_BYTES);
      return { ok: true, status: res.status, text: normalizeText(clipped), bytes: clipped.length };
    } catch (e) {
      return {
        ok: false,
        status: null,
        text: "",
        bytes: 0,
        error: e instanceof Error ? (e.name === "AbortError" ? "Timed out" : e.message) : "Fetch failed",
      };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: null, text: "", bytes: 0, error: "Too many redirects" };
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

const SCAN_UNAVAILABLE =
  "The scan result could not be stored, so this scan did not complete. Nothing was changed — please try again in a moment.";

/** Keeps the technical reason in the logs while the caller sees a safe message. */
function storeFailure(operation: string, detail: string, message: string): never {
  console.error(`[crawler] source store failure (${operation})`, detail);
  throw new Error(message);
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
  if (error) storeFailure("list", error.message, "Could not load your sources right now.");
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
  if (error) {
    if (error.code === "23505") throw new Error("That source is already approved.");
    storeFailure("add", error.message, "Could not add that source.");
  }
  return fromRow(data as SourceRow);
}

export async function removeSource(slug: string, id: string): Promise<void> {
  const { error } = await store().from("presence_sources").delete().eq("presence_slug", slug).eq("id", id);
  if (error) storeFailure("remove", error.message, "Could not remove that source.");
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
    // An unreachable source is an expected scan result; failing to *record*
    // that result is not, and must not be reported as a completed scan.
    const { error } = await supabase
      .from("presence_sources")
      .update({ last_scanned_at: now, last_status: "unavailable", last_error: result.error ?? "Unavailable" })
      .eq("id", source.id);
    if (error) storeFailure("scan-status", error.message, SCAN_UNAVAILABLE);
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
  const { data: previous, error: previousError } = await supabase
    .from("source_snapshots")
    .select("fingerprint, excerpt")
    .eq("source_id", source.id)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Without the previous snapshot every scan looks like a first scan, so a
  // real change would silently never be detected.
  if (previousError) storeFailure("scan-previous", previousError.message, SCAN_UNAVAILABLE);

  const { error: snapshotError } = await supabase.from("source_snapshots").insert({
    source_id: source.id,
    presence_slug: source.presenceSlug,
    fingerprint: print,
    excerpt: excerptOf(result.text),
    byte_size: result.bytes,
    http_status: result.status,
  });
  if (snapshotError) storeFailure("scan-snapshot", snapshotError.message, SCAN_UNAVAILABLE);
  const { error: statusError } = await supabase
    .from("presence_sources")
    .update({ last_scanned_at: now, last_status: "ok", last_error: null, consecutive_failures: 0 })
    .eq("id", source.id);
  if (statusError) storeFailure("scan-status", statusError.message, SCAN_UNAVAILABLE);

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
  const { error } = await supabase.from("source_changes").insert({
    source_id: sourceId,
    presence_slug: slug,
    classification: outcome.classification,
    summary: outcome.summary,
    evidence: outcome.evidence,
    status: "open",
  });
  // A detected change that is not stored is a change the owner never sees.
  if (error) storeFailure("record-change", error.message, SCAN_UNAVAILABLE);
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
  if (error) storeFailure("list-changes", error.message, "Could not load detected changes.");
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
  if (error) storeFailure("resolve-change", error.message, "Could not update that change.");
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
    const { error } = await store()
      .from("published_presences")
      .update({ last_source_scan_at: new Date().toISOString() })
      .eq("slug", slug);
    // Not fatal: the scan results themselves are stored. Only the "last
    // scanned" marker is missing, so the next run simply scans again.
    if (error) logBestEffortFailure("scan-timestamp", error.message);
  }
  return outcomes;
}
