/**
 * Server-side event ingestion for Presence files and API endpoints.
 *
 * AI clients do not execute JavaScript when they fetch llms.txt, Markdown or
 * JSON, so every observable request is logged here, on the server, at the
 * moment the response is produced.
 *
 * Privacy: full IP addresses are never stored. The IP is used in-memory to
 * verify a bot claim and to derive a daily-rotating, non-reversible session
 * hash. Prompts, answers, query strings and identities are never stored.
 */
import { classifyUserAgent, clientIp, ipInAnyCidr, IP_RANGE_SOURCES, parsePrefixDocument, type UaFamily } from "./bots";
import type { EvidenceType, ProviderId } from "./model";

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

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

/** Salt rotates every UTC day, so a hash cannot be correlated across days. */
export function rotatingSaltSeed(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Non-reversible, unlinkable visitor hash. No IP is ever persisted. */
export async function anonymousSessionHash(ip: string | null, ua: string | null, now = new Date()): Promise<string | null> {
  if (!ip) return null;
  const secret = env("SUPABASE_SERVICE_ROLE_KEY") ?? "crawler-local-salt";
  return (await sha256(`crawler-ingest-v1:${rotatingSaltSeed(now)}:${secret}:${ip}:${(ua ?? "").slice(0, 120)}`)).slice(0, 48);
}

/* ------------------------------------------------------------------ */
/* Verified bot check                                                  */
/* ------------------------------------------------------------------ */

const rangeCache = new Map<UaFamily, { ranges: string[]; at: number }>();
const RANGE_TTL_MS = 6 * 60 * 60 * 1000;

async function providerRanges(family: UaFamily): Promise<string[]> {
  const cached = rangeCache.get(family);
  if (cached && Date.now() - cached.at < RANGE_TTL_MS) return cached.ranges;
  const sources = IP_RANGE_SOURCES[family] ?? [];
  const ranges: string[] = [];
  for (const url of sources) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) continue;
      ranges.push(...parsePrefixDocument(await response.json()));
    } catch {
      /* Unreachable range document → the bot simply stays unverified. */
    }
  }
  if (ranges.length) rangeCache.set(family, { ranges, at: Date.now() });
  return ranges;
}

/** True only when UA family AND request IP match the provider's own ranges. */
export async function isVerifiedBot(family: UaFamily, ip: string | null): Promise<boolean> {
  if (!ip || family === "browser" || family === "unknown_bot") return false;
  const ranges = await providerRanges(family);
  if (!ranges.length) return false;
  return ipInAnyCidr(ip, ranges);
}

/* ------------------------------------------------------------------ */
/* Ingestion                                                           */
/* ------------------------------------------------------------------ */

export type IngestEventType =
  | "presence_read"
  | "api_request"
  | "mcp_retrieval"
  | "outbound_click"
  | "mention"
  | "observed_citation";

export type IngestInput = {
  presenceSlug: string;
  eventType: IngestEventType;
  request?: Request;
  path?: string | null;
  httpStatus?: number | null;
  responseBytes?: number | null;
  evidence?: EvidenceType;
  provider?: ProviderId | null;
  surface?: string | null;
  /** Stable key so retries and refreshes can never double-count. */
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
};

function referrerHost(request: Request | undefined): string | null {
  const raw = request?.headers.get("referer");
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Known AI surfaces. A visit whose referrer matches one of these is an
 * attributed AI referral session — measured by Crawler itself, so no external
 * analytics account is ever required.
 */
const AI_REFERRAL_DOMAINS: { domain: string; provider: ProviderId; surface: string }[] = [
  { domain: "chatgpt.com", provider: "openai", surface: "ChatGPT" },
  { domain: "chat.openai.com", provider: "openai", surface: "ChatGPT" },
  { domain: "openai.com", provider: "openai", surface: "OpenAI" },
  { domain: "claude.ai", provider: "anthropic", surface: "Claude" },
  { domain: "anthropic.com", provider: "anthropic", surface: "Claude" },
  { domain: "gemini.google.com", provider: "google", surface: "Gemini" },
  { domain: "bard.google.com", provider: "google", surface: "Gemini" },
  { domain: "aistudio.google.com", provider: "google", surface: "Google AI Studio" },
  { domain: "perplexity.ai", provider: "perplexity", surface: "Perplexity" },
  { domain: "copilot.microsoft.com", provider: "microsoft", surface: "Copilot" },
  { domain: "bing.com", provider: "microsoft", surface: "Bing / Copilot" },
  { domain: "you.com", provider: "other", surface: "You.com" },
  { domain: "poe.com", provider: "other", surface: "Poe" },
  { domain: "grok.com", provider: "other", surface: "Grok" },
  { domain: "x.ai", provider: "other", surface: "Grok" },
];

/** Matches a referrer host against the known AI surfaces (incl. subdomains). */
export function matchAiReferral(host: string | null): { provider: ProviderId; surface: string } | null {
  if (!host) return null;
  const match = AI_REFERRAL_DOMAINS.find((entry) => host === entry.domain || host.endsWith(`.${entry.domain}`));
  return match ? { provider: match.provider, surface: match.surface } : null;
}

/**
 * Records one server-observed event. Never throws and never blocks the
 * response the caller is producing.
 */
export async function ingestServerEvent(input: IngestInput): Promise<boolean> {
  try {
    const supabase = await client();
    if (!supabase) return false;

    const headers = input.request?.headers;
    const ua = headers?.get("user-agent") ?? null;
    const classification = classifyUserAgent(ua);
    const ip = headers ? clientIp(headers) : null;
    const verified = await isVerifiedBot(classification.family, ip);
    const sessionHash = await anonymousSessionHash(ip, ua);
    const now = new Date();
    const path = (input.path ?? "").slice(0, 300) || null;
    const requestId = headers?.get("cf-ray")?.slice(0, 64) ?? crypto.randomUUID();

    const idempotencyKey = (
      input.idempotencyKey ??
      (await sha256(
        [
          input.presenceSlug,
          input.eventType,
          path ?? "",
          sessionHash ?? requestId,
          now.toISOString().slice(0, 16), // one event per client, path and minute
        ].join("|"),
      ))
    ).slice(0, 80);

    const provider = input.provider ?? (classification.isBot ? classification.provider : "other");

    const { error } = await supabase.from("analytics_events").insert({
      presence_slug: input.presenceSlug,
      event_type: input.eventType,
      source_type: "server_logs",
      evidence_type: input.evidence ?? "observed",
      occurred_at: now.toISOString(),
      provider,
      surface: input.surface ?? classification.surface,
      path,
      resource_path: path,
      referrer: referrerHost(input.request),
      user_agent_family: classification.family,
      verified_bot: verified,
      http_status: input.httpStatus ?? 200,
      response_bytes: input.responseBytes ?? null,
      anonymous_session_hash: sessionHash,
      request_id: requestId,
      idempotency_key: idempotencyKey,
      metadata: input.metadata ?? {},
    });

    // 23505 = duplicate idempotency key: a retry, correctly not counted twice.
    if (error && error.code !== "23505") {
      console.error("[crawler] analytics ingest failed", error.message);
      return false;
    }
    return !error;
  } catch (error) {
    console.error("[crawler] analytics ingest crashed", error);
    return false;
  }
}

/** Fire-and-forget wrapper for hot response paths. */
export function ingestAsync(input: IngestInput): void {
  void ingestServerEvent(input).catch(() => undefined);
}
