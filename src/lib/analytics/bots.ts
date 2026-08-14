/**
 * User-agent classification and IP verification helpers.
 *
 * A user agent alone NEVER makes a bot "verified" — anyone can send any UA
 * string. `verified_bot` is only true when the UA family matches a provider
 * AND the request IP falls inside that provider's officially published
 * ranges. Everything else stays unverified.
 */
import type { ProviderId } from "./model";

export type UaFamily =
  | "oai_searchbot"
  | "chatgpt_user"
  | "gptbot"
  | "claudebot"
  | "google_extended"
  | "googlebot"
  | "perplexitybot"
  | "perplexity_user"
  | "bingbot"
  | "unknown_bot"
  | "browser";

export const UA_FAMILY_LABEL: Record<UaFamily, string> = {
  oai_searchbot: "OpenAI OAI-SearchBot",
  chatgpt_user: "OpenAI ChatGPT-User",
  gptbot: "OpenAI GPTBot",
  claudebot: "Anthropic / Claude",
  google_extended: "Google / Gemini (Google-Extended)",
  googlebot: "Googlebot",
  perplexitybot: "PerplexityBot",
  perplexity_user: "Perplexity-User",
  bingbot: "Microsoft / Bingbot",
  unknown_bot: "Unknown bot",
  browser: "Human browser",
};

export type UaClassification = {
  family: UaFamily;
  provider: ProviderId;
  surface: string | null;
  isBot: boolean;
};

const RULES: { test: RegExp; family: UaFamily; provider: ProviderId; surface: string | null }[] = [
  { test: /OAI-SearchBot/i, family: "oai_searchbot", provider: "openai", surface: "ChatGPT Search" },
  { test: /ChatGPT-User/i, family: "chatgpt_user", provider: "openai", surface: "ChatGPT browsing" },
  { test: /GPTBot/i, family: "gptbot", provider: "openai", surface: "OpenAI crawler" },
  { test: /ClaudeBot|Claude-Web|anthropic-ai|Claude-User/i, family: "claudebot", provider: "anthropic", surface: "Claude" },
  { test: /Google-Extended|Google-CloudVertexBot/i, family: "google_extended", provider: "google", surface: "Gemini" },
  { test: /Googlebot|Google-InspectionTool|Storebot-Google/i, family: "googlebot", provider: "google", surface: "Google Search" },
  { test: /Perplexity-User/i, family: "perplexity_user", provider: "perplexity", surface: "Perplexity answer" },
  { test: /PerplexityBot/i, family: "perplexitybot", provider: "perplexity", surface: "Perplexity crawler" },
  { test: /bingbot|BingPreview|msnbot/i, family: "bingbot", provider: "microsoft", surface: "Bing / Copilot" },
];

const GENERIC_BOT = /bot\b|crawler|spider|crawl|http-client|python-requests|curl\/|wget|axios|node-fetch|go-http/i;

export function classifyUserAgent(ua: string | null | undefined): UaClassification {
  const value = (ua ?? "").slice(0, 512);
  if (!value.trim()) {
    return { family: "unknown_bot", provider: "other", surface: null, isBot: true };
  }
  for (const rule of RULES) {
    if (rule.test.test(value)) {
      return { family: rule.family, provider: rule.provider, surface: rule.surface, isBot: true };
    }
  }
  if (GENERIC_BOT.test(value)) {
    return { family: "unknown_bot", provider: "other", surface: null, isBot: true };
  }
  if (/Mozilla\/|Safari\/|Chrome\/|Firefox\//i.test(value)) {
    return { family: "browser", provider: "other", surface: "Browser", isBot: false };
  }
  return { family: "unknown_bot", provider: "other", surface: null, isBot: true };
}

/** Provider-published IP range documents, used to verify a bot claim. */
export const IP_RANGE_SOURCES: Partial<Record<UaFamily, string[]>> = {
  oai_searchbot: ["https://openai.com/searchbot.json"],
  chatgpt_user: ["https://openai.com/chatgpt-user.json"],
  gptbot: ["https://openai.com/gptbot.json"],
  googlebot: ["https://developers.google.com/static/search/apis/ipranges/googlebot.json"],
  google_extended: ["https://developers.google.com/static/search/apis/ipranges/special-crawlers.json"],
  bingbot: ["https://www.bing.com/toolbox/bingbot.json"],
  perplexitybot: ["https://www.perplexity.com/perplexitybot.json"],
  perplexity_user: ["https://www.perplexity.com/perplexity-user.json"],
  // Anthropic publishes no machine-readable range document we can rely on.
  // ClaudeBot therefore stays "unverified" instead of being trusted on UA.
};

/* ------------------------------------------------------------------ */
/* CIDR matching (IPv4 + IPv6)                                         */
/* ------------------------------------------------------------------ */

function ipv4ToBits(ip: string): string | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let bits = "";
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    bits += n.toString(2).padStart(8, "0");
  }
  return bits;
}

function ipv6ToBits(ip: string): string | null {
  const clean = ip.split("%")[0] ?? ip;
  const halves = clean.split("::");
  if (halves.length > 2) return null;
  const expand = (part: string) => (part ? part.split(":").filter(Boolean) : []);
  const head = expand(halves[0] ?? "");
  const tail = halves.length === 2 ? expand(halves[1] ?? "") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && head.length !== 8) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  let bits = "";
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    bits += parseInt(group, 16).toString(2).padStart(16, "0");
  }
  return bits;
}

export function ipToBits(ip: string): string | null {
  const value = ip.trim();
  if (!value) return null;
  return value.includes(":") ? ipv6ToBits(value) : ipv4ToBits(value);
}

/** True when `ip` is inside the CIDR block (e.g. "203.0.113.0/24"). */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [network, prefixRaw] = cidr.trim().split("/");
  if (!network || !prefixRaw) return false;
  const prefix = Number(prefixRaw);
  const ipBits = ipToBits(ip);
  const netBits = ipToBits(network);
  if (!ipBits || !netBits || ipBits.length !== netBits.length) return false;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > ipBits.length) return false;
  return ipBits.slice(0, prefix) === netBits.slice(0, prefix);
}

export function ipInAnyCidr(ip: string, cidrs: string[]): boolean {
  return cidrs.some((cidr) => ipInCidr(ip, cidr));
}

/** Parses the Google/OpenAI/Bing style `{prefixes:[{ipv4Prefix|ipv6Prefix}]}` document. */
export function parsePrefixDocument(doc: unknown): string[] {
  const prefixes = (doc as { prefixes?: Record<string, string>[] })?.prefixes;
  if (!Array.isArray(prefixes)) return [];
  const out: string[] = [];
  for (const entry of prefixes) {
    const value = entry?.["ipv4Prefix"] ?? entry?.["ipv6Prefix"] ?? entry?.["ipv4"] ?? entry?.["ipv6"];
    if (typeof value === "string" && value.includes("/")) out.push(value);
  }
  return out;
}

/** Client IP from the edge headers. Used for verification only, never stored. */
export function clientIp(headers: Headers): string | null {
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const candidate of candidates) {
    const ip = candidate?.trim();
    if (ip && ipToBits(ip)) return ip;
  }
  return null;
}
