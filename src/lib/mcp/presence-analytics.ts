/**
 * Accountless, measurable Presence analytics.
 *
 * What Crawler can actually observe — and therefore the only things stored:
 *  - MCP tool calls whose *structured arguments* reference a published
 *    Presence alias (canonical domain, public slug, normalised entity name)
 *  - distinct anonymous Crawler sessions that mentioned such an alias
 *  - reads of the public Presence files (`/p/<slug>/...`)
 *  - trackable outbound clicks, where they are observable
 *
 * Crawler never receives a ChatGPT/Claude/Gemini conversation. It only ever
 * sees the arguments a tool call passes to it. Nothing in this module may
 * imply otherwise.
 *
 * Data minimisation: an event row carries presence_slug, a constrained
 * event_type, occurred_at, a coarse source class, an optional generated-file
 * path and an unlinkable session fingerprint. No prompts, no answers, no
 * query strings, no IPs, no user agents, no identities.
 */
import { logBestEffortFailure } from "../best-effort";
import type { KnowledgeCore } from "../knowledge";

export type AnalyticsEventType = "mention" | "conversation" | "file_read" | "outbound_click";
export type AnalyticsSource = "mcp" | "web" | "crawler" | "unknown";

/** Raw/minimised events are kept no longer than 13 months. */
export const RETENTION_DAYS = 396;

/** Retries and refreshes inside this window collapse into one event. */
const DEDUPE_WINDOW_MS = 60_000;

async function client() {
  try {
    const { db } = await import("./db.server");
    return db();
  } catch (error) {
    // Measurement must not break a retrieval, so this degrades — but visibly.
    logBestEffortFailure("analytics-client", error);
    return null;
  }
}

function env(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]?.trim();
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Unlinkable session fingerprint. HMAC-SHA-256 with an existing server secret
 * when one is available, otherwise SHA-256 with a domain separator. The raw
 * `sess_` token is never stored and never leaves the server.
 */
export async function sessionFingerprint(sessionToken: string): Promise<string> {
  const separator = "crawler-analytics-v1:";
  const secret = env("SUPABASE_SERVICE_ROLE_KEY");
  const encoder = new TextEncoder();
  if (secret) {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(`${separator}${secret}`),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(sessionToken)));
  }
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(`${separator}${sessionToken}`)));
}

/* ------------------------------------------------------------------ */
/* Alias normalisation                                                 */
/* ------------------------------------------------------------------ */

/** Canonical hostname: lowercase, no scheme, no `www.`, no port, no path. */
export function normalizeDomain(value: string): string | null {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  let host = raw;
  try {
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  return host;
}

/** Safe entity-name normalisation: lowercase, collapse whitespace/punctuation. */
export function normalizeName(value: string): string | null {
  const name = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 120) return null;
  return name;
}

export type Alias = { alias: string; kind: "domain" | "slug" | "name" };

/** Every public handle a Presence may be asked about. */
export function aliasesFor(slug: string, core: KnowledgeCore): Alias[] {
  const out: Alias[] = [{ alias: slug.toLowerCase(), kind: "slug" }];
  const domain = core.website ? normalizeDomain(core.website) : null;
  if (domain) out.push({ alias: domain, kind: "domain" });
  for (const link of core.links ?? []) {
    const linkDomain = normalizeDomain(link.url ?? "");
    if (linkDomain && !out.some((a) => a.alias === linkDomain)) out.push({ alias: linkDomain, kind: "domain" });
  }
  const name = core.name ? normalizeName(core.name) : null;
  if (name) out.push({ alias: name, kind: "name" });
  const nameAsDomain = core.name ? normalizeDomain(core.name) : null;
  if (nameAsDomain && !out.some((a) => a.alias === nameAsDomain)) {
    out.push({ alias: nameAsDomain, kind: "domain" });
  }
  return out;
}

/** Writes (idempotently) the aliases of a Presence. Never throws. */
export async function syncAliases(slug: string, core: KnowledgeCore): Promise<void> {
  const supabase = await client();
  if (!supabase) return;
  const rows = aliasesFor(slug, core).map((a) => ({
    presence_slug: slug,
    alias: a.alias,
    alias_kind: a.kind,
  }));
  if (!rows.length) return;
  const { error } = await supabase
    .from("presence_aliases")
    .upsert(rows, { onConflict: "presence_slug,alias_kind,alias", ignoreDuplicates: true });
  if (error) console.error("[crawler] alias sync failed", error.message);
}

/* ------------------------------------------------------------------ */
/* Alias resolution and matching                                       */
/* ------------------------------------------------------------------ */

/**
 * Candidate aliases contained in a piece of structured tool input. Hostnames
 * are parsed, names are matched on token boundaries via bounded n-grams — a
 * substring never matches.
 */
export function candidateAliases(text: string, maxWords = 5): string[] {
  const out = new Set<string>();
  const source = text.slice(0, 4000);

  for (const match of source.matchAll(/\b(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#][^\s]*)?/gi)) {
    const domain = normalizeDomain(match[1] ?? "");
    if (domain) out.add(domain);
  }

  const words = source
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 400);
  for (let i = 0; i < words.length; i += 1) {
    for (let n = 1; n <= maxWords && i + n <= words.length; n += 1) {
      const phrase = words.slice(i, i + n).join(" ");
      if (phrase.length >= 3 && phrase.length <= 120) out.add(phrase);
    }
  }
  return [...out].slice(0, 800);
}

/** Resolves a domain / URL / entity name / public slug to a Presence slug. */
export async function resolvePresenceSlug(query: string): Promise<string | null> {
  const supabase = await client();
  if (!supabase) return null;
  const candidates = new Set<string>();
  const domain = normalizeDomain(query);
  if (domain) candidates.add(domain);
  const name = normalizeName(query);
  if (name) candidates.add(name);
  const slug = query.trim().toLowerCase();
  if (/^[a-z0-9-]{1,120}$/.test(slug)) candidates.add(slug);
  if (!candidates.size) return null;

  const { data, error } = await supabase
    .from("presence_aliases")
    .select("presence_slug, alias_kind")
    .in("alias", [...candidates])
    .limit(10);
  if (error) {
    console.error("[crawler] alias resolve failed", error.message);
    return null;
  }
  const rows = (data ?? []) as { presence_slug: string; alias_kind: string }[];
  if (!rows.length) return null;
  const order = ["domain", "slug", "name"];
  rows.sort((a, b) => order.indexOf(a.alias_kind) - order.indexOf(b.alias_kind));
  return rows[0]?.presence_slug ?? null;
}

/** Presence slugs referenced by the given tool arguments. */
export async function matchPresences(text: string): Promise<string[]> {
  const supabase = await client();
  if (!supabase) return [];
  const candidates = candidateAliases(text);
  if (!candidates.length) return [];
  const { data, error } = await supabase
    .from("presence_aliases")
    .select("presence_slug")
    .in("alias", candidates)
    .limit(20);
  if (error) {
    console.error("[crawler] alias match failed", error.message);
    return [];
  }
  return [...new Set(((data ?? []) as { presence_slug: string }[]).map((r) => r.presence_slug))];
}

/* ------------------------------------------------------------------ */
/* Ingestion                                                           */
/* ------------------------------------------------------------------ */

export type RecordInput = {
  slug: string;
  eventType: AnalyticsEventType;
  source?: AnalyticsSource;
  sessionToken?: string | undefined;
  filePath?: string | undefined;
  /** Distinguishes genuinely different events; retries reuse the same key. */
  dedupeKey?: string | undefined;
};

/** Short one-way key over the normalised input — never readable content. */
export async function dedupeKeyFor(value: string): Promise<string> {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`crawler-dedupe-v1:${normalized}`));
  return hex(digest).slice(0, 32);
}

/**
 * Records one minimised event. Identical events from the same fingerprint
 * inside the dedupe window are dropped, so retries never inflate counts.
 * Analytics *reads* never call this.
 */
export async function recordEvent(input: RecordInput): Promise<boolean> {
  const supabase = await client();
  if (!supabase) return false;

  const fingerprint = input.sessionToken ? await sessionFingerprint(input.sessionToken) : null;
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const filePath = input.filePath ? input.filePath.slice(0, 200) : null;
  const dedupeKey = input.dedupeKey ? input.dedupeKey.slice(0, 64) : null;

  let dedupe = supabase
    .from("presence_analytics_events")
    .select("id")
    .eq("presence_slug", input.slug)
    .eq("event_type", input.eventType)
    .gte("occurred_at", since)
    .limit(1);
  dedupe = fingerprint ? dedupe.eq("session_fingerprint", fingerprint) : dedupe.is("session_fingerprint", null);
  dedupe = filePath ? dedupe.eq("file_path", filePath) : dedupe.is("file_path", null);
  dedupe = dedupeKey ? dedupe.eq("dedupe_key", dedupeKey) : dedupe.is("dedupe_key", null);

  const { data: existing, error: dedupeError } = await dedupe;
  if (dedupeError) {
    console.error("[crawler] analytics dedupe failed", dedupeError.message);
    return false;
  }
  if (existing && existing.length) return false;

  const { error } = await supabase.from("presence_analytics_events").insert({
    presence_slug: input.slug,
    event_type: input.eventType,
    source: input.source ?? "unknown",
    file_path: filePath,
    session_fingerprint: fingerprint,
    dedupe_key: dedupeKey,
  });
  if (error) {
    console.error("[crawler] analytics insert failed", error.message);
    return false;
  }
  return true;
}

/** Records a mention for every published Presence referenced by tool input. */
export async function recordMentionsFromInput(
  text: string,
  sessionToken?: string | undefined,
): Promise<string[]> {
  if (!text || !text.trim()) return [];
  const slugs = await matchPresences(text);
  const dedupeKey = await dedupeKeyFor(text);
  for (const slug of slugs) {
    await recordEvent({ slug, eventType: "mention", source: "mcp", sessionToken, dedupeKey });
  }
  return slugs;
}

/** Safe retention cleanup: deletes events older than the retention window. */
export async function purgeExpiredEvents(): Promise<void> {
  const supabase = await client();
  if (!supabase) return;
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  const { error } = await supabase.from("presence_analytics_events").delete().lt("occurred_at", cutoff);
  if (error) console.error("[crawler] analytics purge failed", error.message);
}

/* ------------------------------------------------------------------ */
/* Aggregation                                                         */
/* ------------------------------------------------------------------ */

export type Period = 7 | 30 | 90 | "all";

export type PublicSummary = {
  entity_or_domain: string;
  presence: string;
  period_days: number | "all";
  conversations_mentioning: number;
  mention_events: number;
  crawler_reads: number;
  data_since: string | null;
  measurement_scope: "crawler_only";
  privacy_note: string;
};

export type DetailedSummary = {
  period_days: number | "all";
  daily: { date: string; mentions: number; reads: number; clicks: number }[];
  question_themes: { label: string; count: number }[];
  file_reads: { path: string; count: number }[];
  outbound_clicks: number;
  sources: { source: string; count: number }[];
};

export const PRIVACY_NOTE =
  "Measured inside Crawler only: Crawler tool calls that referenced this Presence, distinct anonymous Crawler sessions, and observable reads of the published Presence files. This is not a measure of all ChatGPT, Claude, Gemini or internet conversations — Crawler never receives those.";

type EventRow = {
  event_type: AnalyticsEventType;
  occurred_at: string;
  source: string;
  file_path: string | null;
  session_fingerprint: string | null;
};

async function loadEvents(slug: string, period: Period): Promise<EventRow[] | null> {
  const supabase = await client();
  if (!supabase) return null;
  let query = supabase
    .from("presence_analytics_events")
    .select("event_type, occurred_at, source, file_path, session_fingerprint")
    .eq("presence_slug", slug)
    .order("occurred_at", { ascending: true })
    .limit(20000);
  if (period !== "all") {
    query = query.gte("occurred_at", new Date(Date.now() - period * 86_400_000).toISOString());
  }
  const { data, error } = await query;
  if (error) {
    console.error("[crawler] analytics read failed", error.message);
    return null;
  }
  return (data ?? []) as EventRow[];
}

export async function publicSummary(
  slug: string,
  label: string,
  period: Period,
): Promise<PublicSummary | null> {
  const rows = await loadEvents(slug, period);
  if (!rows) return null;
  const mentions = rows.filter((r) => r.event_type === "mention" || r.event_type === "conversation");
  const distinct = new Set(mentions.map((r) => r.session_fingerprint).filter(Boolean));
  return {
    entity_or_domain: label,
    presence: slug,
    period_days: period,
    conversations_mentioning: distinct.size,
    mention_events: mentions.length,
    crawler_reads: rows.filter((r) => r.event_type === "file_read").length,
    data_since: rows[0]?.occurred_at ?? null,
    measurement_scope: "crawler_only",
    privacy_note: PRIVACY_NOTE,
  };
}

export async function detailedSummary(slug: string, period: Period): Promise<DetailedSummary | null> {
  const rows = await loadEvents(slug, period);
  if (!rows) return null;

  const byDay = new Map<string, { date: string; mentions: number; reads: number; clicks: number }>();
  const byFile = new Map<string, number>();
  const bySource = new Map<string, number>();

  for (const row of rows) {
    const date = row.occurred_at.slice(0, 10);
    const day = byDay.get(date) ?? { date, mentions: 0, reads: 0, clicks: 0 };
    if (row.event_type === "mention" || row.event_type === "conversation") day.mentions += 1;
    if (row.event_type === "file_read") day.reads += 1;
    if (row.event_type === "outbound_click") day.clicks += 1;
    byDay.set(date, day);
    if (row.event_type === "file_read" && row.file_path) {
      byFile.set(row.file_path, (byFile.get(row.file_path) ?? 0) + 1);
    }
    bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
  }

  const fileReads = [...byFile.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count);

  return {
    period_days: period,
    daily: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    // Normalised themes derived from which generated file was read — Crawler
    // never stores raw questions, so this is the only truthful theme signal.
    question_themes: fileReads.slice(0, 8).map((f) => ({ label: f.path, count: f.count })),
    file_reads: fileReads,
    outbound_clicks: rows.filter((r) => r.event_type === "outbound_click").length,
    sources: [...bySource.entries()].map(([source, count]) => ({ source, count })),
  };
}

/** Whether this Presence has any measured events at all. */
export async function hasEvents(slug: string): Promise<boolean> {
  const supabase = await client();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("presence_analytics_events")
    .select("id")
    .eq("presence_slug", slug)
    .limit(1);
  if (error) {
    console.error("[crawler] analytics presence check failed", error.message);
    return false;
  }
  return Boolean(data && data.length);
}
