/**
 * CrawlMe — server-side retrieval layer.
 *
 * One central, read-only API over the canonical published data. It derives
 * everything from the exact same `published_presences` record that already
 * feeds `/p/<slug>/…`, `llms.txt`, the Markdown pages and the JSON endpoints,
 * so no two surfaces can ever disagree.
 *
 * Only Presences with status `live` are exposed, and only the fields the owner
 * deliberately published. Drafts, interview transcripts, recovery codes,
 * management secrets, billing data, analytics internals and any private
 * identifier never leave this module.
 */
import { CRAWLME_DISCLAIMER, CRAWLME_SOURCE, type EntitySection } from "./crawlme";
import { entityLabel, type CatalogItem, type KnowledgeCore } from "./knowledge";
import { getLivePresence, type PublishedPresence } from "./mcp/presences";
import { normalizeDomain, normalizeName } from "./mcp/presence-analytics";
import { siteUrl } from "./mcp/site";

async function client() {
  try {
    const { db } = await import("./mcp/db.server");
    return db();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */

export type EntityLookup = {
  id?: string | undefined;
  domain?: string | undefined;
  url?: string | undefined;
  name?: string | undefined;
};

const SLUG_RE = /^[a-z0-9-]{1,120}$/;

/** Pulls a Crawler slug out of a published Crawler Today URL. */
function slugFromUrl(value: string): string | null {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const match = url.pathname.match(/^\/p\/([a-z0-9-]{1,120})(\/|$)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolves any supported identifier to a live Presence.
 * Order: entity id / slug → Crawler URL → domain (incl. verified custom
 * domain) → unambiguous entity name.
 */
export async function resolveEntity(lookup: EntityLookup): Promise<PublishedPresence | null> {
  const direct = (lookup.id ?? "").trim().toLowerCase();
  if (direct && SLUG_RE.test(direct)) {
    const found = await getLivePresence(direct);
    if (found) return found;
  }

  for (const candidate of [lookup.url, lookup.domain, lookup.id, lookup.name]) {
    if (!candidate) continue;
    const slug = slugFromUrl(candidate);
    if (slug) {
      const found = await getLivePresence(slug);
      if (found) return found;
    }
  }

  const supabase = await client();
  if (!supabase) return null;

  const domainCandidates = new Set<string>();
  for (const candidate of [lookup.domain, lookup.url, lookup.id, lookup.name]) {
    const domain = candidate ? normalizeDomain(candidate) : null;
    if (domain) domainCandidates.add(domain);
  }

  if (domainCandidates.size) {
    const { data } = await supabase
      .from("published_presences")
      .select("slug")
      .in("custom_domain", [...domainCandidates])
      .not("custom_domain_verified_at", "is", null)
      .eq("status", "live")
      .limit(1);
    const slug = (data as { slug: string }[] | null)?.[0]?.slug;
    if (slug) {
      const found = await getLivePresence(slug);
      if (found) return found;
    }
  }

  const aliasCandidates = new Set<string>([...domainCandidates]);
  const name = lookup.name ? normalizeName(lookup.name) : null;
  if (name) aliasCandidates.add(name);
  if (!aliasCandidates.size) return null;

  const { data, error } = await supabase
    .from("presence_aliases")
    .select("presence_slug, alias_kind")
    .in("alias", [...aliasCandidates])
    .limit(20);
  if (error) return null;

  const rows = (data ?? []) as { presence_slug: string; alias_kind: string }[];
  const order = ["domain", "slug", "name"];
  rows.sort((a, b) => order.indexOf(a.alias_kind) - order.indexOf(b.alias_kind));

  // An ambiguous *name* must never resolve silently to the wrong entity.
  const distinct = new Set(rows.map((r) => r.presence_slug));
  const first = rows[0];
  if (!first) return null;
  if (first.alias_kind === "name" && distinct.size > 1) return null;

  return (await getLivePresence(first.presence_slug)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Search / discovery                                                  */
/* ------------------------------------------------------------------ */

export type SearchHit = {
  entity_id: string;
  name: string;
  entity_type: string;
  domain: string | null;
  short_description: string;
  crawler_url: string;
  api_url: string;
  updated_at: string;
  version: number;
};

const escapeLike = (value: string) => value.replace(/[\\%_,]/g, " ").trim();

/** Lightweight discovery so a client does not need to know the exact id. */
export async function searchEntities(
  query: string,
  options: { entityType?: string | undefined; limit?: number | undefined } = {},
): Promise<SearchHit[]> {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);
  const term = escapeLike(query).slice(0, 120);
  if (term.length < 2) return [];

  const slugs = new Set<string>();

  const exact = await resolveEntity({ id: term, domain: term, url: term, name: term });
  if (exact) slugs.add(exact.slug);

  const supabase = await client();
  if (supabase) {
    const { data } = await supabase
      .from("presence_aliases")
      .select("presence_slug")
      .ilike("alias", `%${term.toLowerCase()}%`)
      .limit(limit * 3);
    for (const row of (data ?? []) as { presence_slug: string }[]) slugs.add(row.presence_slug);
  }

  const hits: SearchHit[] = [];
  for (const slug of slugs) {
    if (hits.length >= limit) break;
    const presence = await getLivePresence(slug);
    if (!presence) continue;
    if (options.entityType && presence.core.entityType !== options.entityType) continue;
    hits.push(searchHit(presence));
  }
  return hits;
}

function searchHit(p: PublishedPresence): SearchHit {
  const c = p.core;
  return {
    entity_id: p.slug,
    name: c.name || p.slug,
    entity_type: c.entityType,
    domain: c.website ? normalizeDomain(c.website) : null,
    short_description: (c.tagline || c.summary || "").slice(0, 200),
    crawler_url: `${siteUrl()}/p/${p.slug}`,
    api_url: `${siteUrl()}/api/crawl-me?id=${encodeURIComponent(p.slug)}`,
    updated_at: p.updatedAt,
    version: p.version,
  };
}

export { searchHit };

/* ------------------------------------------------------------------ */
/* Payload building                                                    */
/* ------------------------------------------------------------------ */

const PRICING_HINT = /(price|pricing|preis|kosten|cost|rate|fee|tarif|plan)/i;
const TEAM_HINT = /(founder|owner|team|ceo|gründer|grunder|inhaber|partner|staff)/i;
const LOCATION_HINT = /(location|address|city|country|standort|adresse|studio|office)/i;
const CONTACT_HINT = /(contact|email|e-mail|phone|telefon|kontakt|booking)/i;
const TERM_HINT = /(term|glossary|definition|begriff|terminologie|abbreviation)/i;
const AUDIENCE_HINT = /(audience|customer|client|zielgruppe|kunden|for whom)/i;
const DIFF_HINT = /(different|unique|usp|why us|besonder|differenz|advantage)/i;

const item = (i: CatalogItem) => ({
  id: i.id,
  name: i.name,
  summary: i.summary,
  ...(i.details ? { details: i.details } : {}),
  ...(i.url ? { url: i.url } : {}),
  ...(i.tags?.length ? { tags: i.tags } : {}),
});

function factsMatching(core: KnowledgeCore, re: RegExp) {
  return core.facts
    .filter((f) => re.test(f.label) || re.test(f.value))
    .map((f) => ({ label: f.label, value: f.value, status: f.status, ...(f.source ? { source_url: f.source } : {}) }));
}

function kind(core: KnowledgeCore, k: CatalogItem["kind"]) {
  return core.items.filter((i) => i.kind === k).map(item);
}

export type Freshness = {
  published_at: string;
  updated_at: string;
  version: number;
};

export function freshness(p: PublishedPresence): Freshness {
  return { published_at: p.publishedAt, updated_at: p.updatedAt, version: p.version };
}

function attribution(p: PublishedPresence) {
  return {
    source: CRAWLME_SOURCE,
    source_type: "entity_published_first_party",
    canonical_url: `${siteUrl()}/p/${p.slug}`,
    api_url: `${siteUrl()}/api/crawl-me?id=${encodeURIComponent(p.slug)}`,
    machine_readable_files: p.files.map((f) => `${siteUrl()}/p/${p.slug}/${f.path}`),
    disclaimer: CRAWLME_DISCLAIMER,
  };
}

/** Compact overview — token efficient, safe for every client. */
export function entitySummary(p: PublishedPresence) {
  const c = p.core;
  return {
    entity_id: p.slug,
    entity_type: c.entityType,
    entity_type_label: entityLabel[c.entityType],
    name: c.name || p.slug,
    tagline: c.tagline || null,
    short_description: (c.summary || c.tagline || "").slice(0, 400),
    website: c.website ?? null,
    domain: c.website ? normalizeDomain(c.website) : null,
    languages: c.languages ?? [],
    location: c.location ?? null,
    counts: {
      facts: c.facts.length,
      verified_facts: c.facts.filter((f) => f.status === "verified").length,
      offerings: c.items.filter((i) => i.kind === "offering").length,
      services: c.items.filter((i) => i.kind === "service").length,
      projects: c.items.filter((i) => i.kind === "project").length,
      faqs: c.faqs.length,
    },
    available_sections: availableSections(c),
    freshness: freshness(p),
    attribution: attribution(p),
  };
}

export function availableSections(c: KnowledgeCore): EntitySection[] {
  const out: EntitySection[] = ["about"];
  if (c.items.some((i) => i.kind === "offering")) out.push("offerings", "products");
  if (c.items.some((i) => i.kind === "service")) out.push("services");
  if (c.items.some((i) => i.kind === "project")) out.push("projects");
  if (factsMatching(c, PRICING_HINT).length) out.push("pricing");
  if (c.faqs.length) out.push("faq");
  if (c.facts.length) out.push("facts", "claims");
  if (factsMatching(c, CONTACT_HINT).length || c.website || c.links.length) out.push("contact");
  if (c.links.length) out.push("links");
  if (c.cv.length || factsMatching(c, TEAM_HINT).length) out.push("team");
  if (c.location || factsMatching(c, LOCATION_HINT).length) out.push("locations");
  if (factsMatching(c, TERM_HINT).length) out.push("terminology");
  return [...new Set(out)];
}

/** One section only — keeps conversational payloads small. */
export function entitySection(p: PublishedPresence, section: EntitySection) {
  const c = p.core;
  const data = (() => {
    switch (section) {
      case "about":
        return {
          name: c.name,
          entity_type: c.entityType,
          tagline: c.tagline,
          summary: c.summary,
          languages: c.languages ?? [],
          positioning: c.stories.map((s) => ({ label: s.label, text: s.text, confirmed: s.confirmed })),
        };
      case "offerings":
      case "products":
        return { offerings: kind(c, "offering") };
      case "services":
        return { services: kind(c, "service") };
      case "projects":
        return { projects: kind(c, "project") };
      case "pricing":
        return { pricing: factsMatching(c, PRICING_HINT) };
      case "faq":
        return { faq: c.faqs.map((f) => ({ question: f.question, answer: f.answer })) };
      case "facts":
        return { facts: factsMatching(c, /.*/).filter((f) => f.status === "verified") };
      case "claims":
        return { claims: factsMatching(c, /.*/).filter((f) => f.status === "claimed") };
      case "contact":
        return {
          website: c.website ?? null,
          contact: factsMatching(c, CONTACT_HINT),
          links: c.links,
        };
      case "links":
        return { links: c.links };
      case "team":
        return {
          team: factsMatching(c, TEAM_HINT),
          cv: c.cv.map((e) => ({ role: e.role, organization: e.organization, period: e.period, note: e.note })),
        };
      case "locations":
        return { location: c.location ?? null, locations: factsMatching(c, LOCATION_HINT) };
      case "terminology":
        return { terminology: factsMatching(c, TERM_HINT) };
      default:
        return {};
    }
  })();

  return {
    entity_id: p.slug,
    name: c.name || p.slug,
    section,
    data,
    freshness: freshness(p),
    attribution: attribution(p),
  };
}

/** The complete published Knowledge Core, machine-first. */
export function entityPayload(p: PublishedPresence) {
  const c = p.core;
  return {
    entity_id: p.slug,
    entity_type: c.entityType,
    entity_type_label: entityLabel[c.entityType],
    name: c.name || p.slug,
    tagline: c.tagline || null,
    short_description: (c.tagline || c.summary || "").slice(0, 200),
    full_description: c.summary || null,
    website: c.website ?? null,
    domain: c.website ? normalizeDomain(c.website) : null,
    languages: c.languages ?? [],
    location: c.location ?? null,
    locations: factsMatching(c, LOCATION_HINT),
    contact: factsMatching(c, CONTACT_HINT),
    offerings: kind(c, "offering"),
    products: kind(c, "offering"),
    services: kind(c, "service"),
    projects: kind(c, "project"),
    pricing: factsMatching(c, PRICING_HINT),
    team: {
      people: factsMatching(c, TEAM_HINT),
      cv: c.cv.map((e) => ({ role: e.role, organization: e.organization, period: e.period, note: e.note })),
    },
    facts: factsMatching(c, /.*/).filter((f) => f.status === "verified"),
    claims: factsMatching(c, /.*/).filter((f) => f.status === "claimed"),
    positioning: c.stories.map((s) => ({ label: s.label, text: s.text, confirmed: s.confirmed })),
    target_audiences: factsMatching(c, AUDIENCE_HINT),
    differentiators: factsMatching(c, DIFF_HINT),
    terminology: factsMatching(c, TERM_HINT),
    faq: c.faqs.map((f) => ({ question: f.question, answer: f.answer })),
    links: c.links,
    important_urls: [
      ...(c.website ? [{ label: "Website", url: c.website }] : []),
      ...c.links,
      { label: "Crawler Today Presence", url: `${siteUrl()}/p/${p.slug}` },
    ],
    source_urls: [...new Set(c.facts.map((f) => f.source).filter(Boolean))],
    knowledge_core: c,
    plan_tier: p.plan,
    freshness: freshness(p),
    published_at: p.publishedAt,
    updated_at: p.updatedAt,
    version: p.version,
    attribution: attribution(p),
  };
}

/** Minimal change-detection payload for agents that poll. */
export function entityUpdates(
  p: PublishedPresence,
  known: { version?: number | undefined; since?: string | undefined },
) {
  const sinceDate = known.since ? Date.parse(known.since) : NaN;
  const changedBySince = Number.isNaN(sinceDate) ? null : Date.parse(p.updatedAt) > sinceDate;
  const changedByVersion = typeof known.version === "number" ? p.version > known.version : null;
  const changed = changedByVersion ?? changedBySince ?? true;
  return {
    entity_id: p.slug,
    name: p.core.name || p.slug,
    changed,
    current_version: p.version,
    published_at: p.publishedAt,
    updated_at: p.updatedAt,
    attribution: attribution(p),
  };
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

/**
 * Weak validator over the exact published version. It changes the moment a
 * Presence is republished, so a client can revalidate cheaply and can never be
 * served a stale Knowledge Core after an update.
 */
export function entityEtag(p: PublishedPresence, variant: string): string {
  return `W/"${p.slug}-${p.version}-${Date.parse(p.updatedAt) || 0}-${variant}"`;
}

export function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Revalidate on every request: an update must be visible immediately.
      "cache-control": "public, max-age=0, must-revalidate",
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

export function apiError(status: number, error: string, hint?: string) {
  return jsonResponse({ error, ...(hint ? { hint } : {}), source: CRAWLME_SOURCE }, { status, headers: { "cache-control": "no-store" } });
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

const MONITORING_UA = /(uptime|pingdom|monitor|healthcheck|health-check|statuscake|betterstack|lovable-preview|vercel-screenshot|curl\/)/i;

/** Requests Crawler makes about itself, or obvious monitoring traffic. */
export function isInternalTraffic(request: Request): boolean {
  const ua = request.headers.get("user-agent") ?? "";
  if (MONITORING_UA.test(ua)) return true;
  if (request.headers.get("x-crawler-internal") === "1") return true;
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
}

export type RetrievalChannel = "crawlme_api" | "mcp";

/**
 * Records a retrieval Crawler genuinely observed. This is an API/MCP request —
 * never evidence that an AI "mentioned" the entity.
 */
export async function recordRetrieval(input: {
  slug: string;
  channel: RetrievalChannel;
  section?: string | undefined;
  client?: string | undefined;
}): Promise<void> {
  try {
    const supabase = await client();
    if (!supabase) return;
    await supabase.from("analytics_events").insert({
      presence_slug: input.slug,
      event_type: input.channel === "mcp" ? "mcp_retrieval" : "api_request",
      source_type: "ai_retrieval",
      resource_path: input.section ? `section:${input.section}` : "knowledge_core",
      metadata: input.client ? { client: input.client.slice(0, 80) } : {},
    });
  } catch {
    /* analytics must never break a retrieval */
  }
}

/** Coarse, non-identifying client label from the user agent. */
export function clientLabel(request: Request): string | undefined {
  const ua = request.headers.get("user-agent");
  if (!ua) return undefined;
  const known = ["ChatGPT", "OpenAI", "Claude", "Anthropic", "Gemini", "Google", "Perplexity", "python-requests", "node-fetch"];
  const hit = known.find((k) => ua.toLowerCase().includes(k.toLowerCase()));
  return hit ?? "other";
}

/* ------------------------------------------------------------------ */
/* HTML rendering                                                      */
/* ------------------------------------------------------------------ */

/**
 * Some AI fetchers (Gemini in strict mode, many "read this URL" tools) refuse
 * or discard raw JSON responses. Every CrawlMe URL therefore also answers with
 * a plain, semantic HTML document when the client asks for HTML — same data,
 * readable for humans, crawlers and assistants alike.
 */
export function wantsHtml(request: Request): boolean {
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (format === "json") return false;
  if (format === "html") return true;
  const accept = (request.headers.get("accept") ?? "").toLowerCase();
  if (accept.includes("application/json")) return false;
  return accept.includes("text/html") || accept.includes("*/*") === false ? accept.includes("text/html") : false;
}

const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) {
    if (!value.length) return "";
    return `<ul>${value.map((v) => `<li>${renderValue(v)}</li>`).join("")}</ul>`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length),
    );
    if (!entries.length) return "";
    return `<dl>${entries
      .map(([k, v]) => `<dt>${esc(k.replace(/_/g, " "))}</dt><dd>${renderValue(v)}</dd>`)
      .join("")}</dl>`;
  }
  return esc(value);
}

const HTML_STYLE =
  "body{max-width:52rem;margin:0 auto;padding:2.5rem 1.25rem;font:16px/1.6 ui-sans-serif,system-ui,sans-serif;color:#111}" +
  "h1{font-size:1.9rem;margin:0 0 .25rem}h2{font-size:1.05rem;margin:2rem 0 .5rem;text-transform:uppercase;letter-spacing:.06em}" +
  "dt{font-weight:600;margin-top:.5rem}dd{margin:0 0 .25rem 1rem}ul{margin:.25rem 0 .25rem 1.1rem;padding:0}" +
  "a{color:inherit}code,footer{color:#666;font-size:.85rem}hr{border:0;border-top:1px solid #ddd;margin:2rem 0}";

/** Renders any CrawlMe payload (full, summary or single section) as HTML. */
export function entityHtml(p: PublishedPresence, payload: Record<string, unknown>, variant: string): Response {
  const name = String(payload["name"] ?? p.slug);
  const description = String(payload["short_description"] ?? payload["tagline"] ?? p.core.summary ?? "").slice(0, 300);
  const skip = new Set(["name", "entity_id", "knowledge_core", "attribution", "freshness"]);
  const sections = Object.entries(payload)
    .filter(([key, value]) => !skip.has(key) && renderValue(value))
    .map(([key, value]) => `<section><h2>${esc(key.replace(/_/g, " "))}</h2>${renderValue(value)}</section>`)
    .join("");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    description,
    url: `${siteUrl()}/c/${p.slug}`,
    dateModified: p.updatedAt,
    isPartOf: { "@type": "WebSite", name: CRAWLME_SOURCE, url: siteUrl() },
  };

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} — Crawler Today</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${esc(`${siteUrl()}/c/${p.slug}`)}">
<link rel="alternate" type="application/json" href="${esc(`${siteUrl()}/c/${p.slug}?format=json`)}">
<style>${HTML_STYLE}</style>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head><body><main>
<h1>${esc(name)}</h1>
${description ? `<p>${esc(description)}</p>` : ""}
${sections}
<hr>
<footer><p>${esc(CRAWLME_DISCLAIMER)}</p>
<p>Source: ${esc(CRAWLME_SOURCE)} · view: ${esc(variant)} · updated ${esc(p.updatedAt)} · version ${esc(p.version)}</p>
<p>Machine-readable: <a href="${esc(`${siteUrl()}/c/${p.slug}?format=json`)}">JSON</a></p></footer>
</main></body></html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
      ...CORS_HEADERS,
    },
  });
}

/** Human/crawler readable error page, used when the client asked for HTML. */
export function htmlError(status: number, title: string, hint: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} — Crawler Today</title>` +
      `<meta name="robots" content="noindex"><style>${HTML_STYLE}</style></head><body><main>` +
      `<h1>${esc(title)}</h1><p>${esc(hint)}</p></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...CORS_HEADERS } },
  );
}
