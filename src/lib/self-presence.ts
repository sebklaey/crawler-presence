/**
 * Crawler's own public AI Presence.
 *
 * Built from the same Knowledge Core generator every customer Presence uses, so
 * the canonical domain serves real, generated files — not hand-written copies.
 * Every fact here must be true of the deployed product.
 */
import { type GeneratedFile, type KnowledgeCore, generatedFiles } from "./knowledge";
import type { CoreExtension, ExtRecord } from "./kc/model";

const now = "2026-08-14T00:00:00.000Z";

const rec = (
  id: string,
  title: string,
  body: string,
  fields: [string, string][] = [],
  status: ExtRecord["status"] = "verified_fact",
): ExtRecord => ({
  id,
  title,
  body,
  fields: fields.map(([key, value]) => ({ key, value })),
  status,
  visibility: "public",
  updatedAt: now,
});

const extension = (): CoreExtension => ({
  v: 1,
  organization: {
    legalName: "SEBKLAEY",
    headquarters: "Switzerland",
    contactEmail: "sebklay@me.com",
    regions: "Worldwide (digital service, delivered over the internet)",
    size: "Independent software operation",
  },
  audiences: [
    rec(
      "a1",
      "People and creators",
      "Actors, photographers, musicians, writers, coaches, consultants and other individuals who want assistants to describe them accurately instead of guessing from scattered web fragments.",
      [["Typical plan", "Plus $5/month"]],
    ),
    rec(
      "a2",
      "Shops, product brands and manufacturers",
      "Businesses with an offering list — products, models, variants, materials, use cases — that want each record machine-readable with stable identifiers and URLs.",
      [["Typical plan", "Pro $20/month"]],
    ),
    rec(
      "a3",
      "Companies, agencies and projects",
      "Teams that maintain a larger body of information, need continuous updates, scheduled report emails, shared team access and API access to their own Presence data.",
      [["Typical plan", "Business $80/month"]],
    ),
    rec(
      "a4",
      "AI systems and agents",
      "Assistants, crawlers and agents that need one owner-approved, structured source about an entity in plain text, Markdown and JSON, plus a public MCP server to query it.",
      [["Access", "Public, no authentication, no cost"]],
    ),
  ],
  pricing: [
    rec("p1", "Free — create and preview", "The adaptive interview, the Knowledge Core and every generated file preview are free and require no account. You pay only to keep a Presence published and hosted.", [
      ["Price", "$0"],
      ["Includes", "Interview, Knowledge Core, full file previews"],
    ]),
    rec("p2", "Plus — publish and stay online", "Hosting for one published Presence with a small set of content records and basic measurement. Analysis feedback and improvement recommendations are not part of Plus.", [
      ["Price", "$5 per month"],
      ["Content records", "10"],
      ["Measurement window", "7 days"],
      ["Not included", "Improvement Loop, detailed insights, custom domain"],
    ]),
    rec("p3", "Pro — analyse, learn and improve", "Adds the Improvement Loop: measured data and Knowledge Core analysis turned into concrete recommendations, a 90-day insight window, weekly source checks and a custom domain.", [
      ["Price", "$20 per month"],
      ["Content records", "200"],
      ["Measurement window", "90 days"],
      ["Adds", "Improvement Loop, detailed insights, custom domain, weekly source checks"],
    ]),
    rec("p4", "Business — extensive data, continuously current", "For large bodies of information kept current: daily monitoring and source checks, scheduled report emails, shared team access via team codes and REST API access.", [
      ["Price", "$80 per month"],
      ["Content records", "5,000"],
      ["Measurement window", "Unlimited"],
      ["Adds", "Daily monitoring, report emails, team access, API access"],
    ]),
    rec("p5", "Billing and cancellation", "Subscriptions are monthly and recurring until cancelled. Payments are processed by the payment provider; Crawler never sees or stores card data. Cancel any time at /manage with the recovery code.", [
      ["Currency", "USD"],
      ["Merchant of record", "Payment provider (Paddle)"],
      ["Cancellation", "Self-service at https://crawler.today/manage"],
    ]),
  ],
  news: [
    rec("n1", "Knowledge Core Editor", "A full editor with an AI assistant, structured data sections, source tracking, diff review, version history and confirm-before-publish. The assistant may only propose changes; publishing is always the owner's action.", [
      ["Area", "Product"],
      ["Status", "Live"],
    ]),
    rec("n2", "Analytics and Improvement dashboard", "Measured accesses, files read, outbound clicks and improvement potential, with 7/30/90-day and all-time windows, a trend chart and a most-read-content table. Empty states are shown honestly when nothing was measured.", [
      ["Area", "Analytics"],
      ["Status", "Live"],
    ]),
    rec("n3", "Public MCP server for AI clients", "A no-auth MCP endpoint at https://crawler.today/mcp lets ChatGPT and other MCP clients run the interview, build a Knowledge Core, preview files and retrieve published Presences.", [
      ["Area", "Integrations"],
      ["Status", "Live"],
    ]),
  ],
  evidence: {},
  archive: [],
});

export const crawlerCore = (): KnowledgeCore => ({
  entityType: "company",
  name: "Crawler",
  tagline: "Turn scattered business information into one verified, continuously updated AI Presence.",
  summary:
    "Crawler (crawler.today) is a digital SaaS product that makes an entity — a person, creator, shop, product brand, manufacturer, company or project — readable and answerable for AI systems. It runs an adaptive AI interview instead of a fixed questionnaire: the first prompt is open (describe what you do, or paste a website or product link), Crawler infers the entity type and then asks domain-specific follow-up questions based on the real information gaps, so a photographer is asked different questions than a handmade beauty store or a bike manufacturer with many models. All answers land in one structured Knowledge Core that keeps verified facts strictly separate from storytelling and positioning, with every claim confirmed by the owner. From that single core Crawler generates AI-readable files — llms.txt, llms-full.txt, about.md, offerings.md, projects.md, services.md, faq.md, audiences.md, pricing.md, news.md, cv.md where relevant, plus JSON endpoints for entity, offerings, projects and services — and serves them on stable public URLs under https://crawler.today/p/<slug>/. Creating and previewing is free; hosting a published Presence is the paid step (Plus $5, Pro $20, Business $80 per month). Crawler works without any account: there is no registration, no login and no OAuth. A published Presence is controlled by a one-time high-entropy recovery code of which only a hash is stored server-side. Crawler measures exclusively what it can observe itself — requests to published Presence files and API endpoints, Crawler tool interactions and outbound link clicks routed through Crawler — and never claims access to private ChatGPT, Claude, Gemini, Perplexity or other assistant conversations, and never guarantees rankings, indexing, citations or mentions by external AI systems.",
  location: "Switzerland",
  website: "https://crawler.today",
  languages: ["en", "de"],
  facts: [
    { id: "f1", label: "Product", value: "Digital SaaS that builds, hosts and maintains AI-readable presence files for an entity", status: "verified" },
    { id: "f2", label: "Canonical domain", value: "https://crawler.today", status: "verified" },
    { id: "f3", label: "Operator", value: "SEBKLAEY, Switzerland", status: "verified" },
    { id: "f4", label: "Support contact", value: "sebklay@me.com and https://crawler.today/support", status: "verified" },
    { id: "f5", label: "Plans", value: "Plus $5/month, Pro $20/month, Business $80/month (USD, recurring monthly)", status: "verified" },
    { id: "f6", label: "Free scope", value: "Adaptive interview, Knowledge Core and all generated file previews are free", status: "verified" },
    { id: "f7", label: "Paid scope", value: "Hosting and publishing a Presence on a stable public URL is the paid step", status: "verified" },
    { id: "f8", label: "Accounts", value: "No registration, no login, no OAuth, no user profiles — ownership is capability-based", status: "verified" },
    { id: "f9", label: "Ownership control", value: "A one-time recovery code (format crw_ + 64 hex characters); only a cryptographic hash is stored, so a lost code cannot be recovered", status: "verified" },
    { id: "f10", label: "Management URL", value: "https://crawler.today/manage — enter <slug>~<recovery code> to manage, update, unpublish, rotate the code or cancel", status: "verified" },
    { id: "f11", label: "MCP endpoint", value: "https://crawler.today/mcp — public MCP server, auth type none, connectable from ChatGPT Developer Mode and other MCP clients", status: "verified" },
    { id: "f12", label: "Published Presence URL", value: "https://crawler.today/p/<slug>/ with files such as llms.txt, llms-full.txt, about.md, offerings.md, faq.md and api/entity.json", status: "verified" },
    { id: "f13", label: "Clean retrieval aliases", value: "https://crawler.today/c/<slug>/summary and related clean paths for AI clients that reject query parameters", status: "verified" },
    { id: "f14", label: "Generated formats", value: "Plain text (llms.txt, llms-full.txt), Markdown (about, offerings, projects, services, faq, audiences, pricing, news, cv) and JSON endpoints", status: "verified" },
    { id: "f15", label: "Fact separation", value: "Every entry is either a verified fact confirmed by the owner or clearly marked positioning, marketing claim, estimate or forecast", status: "verified" },
    { id: "f16", label: "What Crawler measures", value: "Requests to published Presence files and API endpoints, Crawler tool interactions referencing the Presence, and outbound link clicks routed through Crawler", status: "verified" },
    { id: "f17", label: "What Crawler cannot measure", value: "Private conversations inside ChatGPT, Claude, Gemini, Perplexity or any other assistant", status: "verified" },
    { id: "f18", label: "Analytics data minimisation", value: "Only presence slug, event type, UTC timestamp, source and an unlinkable HMAC-SHA-256 session fingerprint are stored; no raw conversation text", status: "verified" },
    { id: "f19", label: "Public aggregate analytics", value: "Aggregate mention counts per entity, domain or slug are available without a code via the get_analytics MCP tool; detailed analytics require the recovery code", status: "verified" },
    { id: "f20", label: "No guarantees", value: "Crawler does not guarantee rankings, indexing, citations or mentions by any external AI system", status: "verified" },
    { id: "f21", label: "Physical goods", value: "None — no shipping, no fulfilment, digital service delivered over the internet only", status: "verified" },
    { id: "f22", label: "Languages", value: "Interface in English; the interview and Knowledge Core work in English and German", status: "verified" },
    { id: "f23", label: "Payments", value: "Handled by the payment provider (Paddle) as merchant of record; Crawler never sees or stores card data", status: "verified" },
    { id: "f24", label: "Timestamps", value: "All measurement and publication timestamps are UTC", status: "verified" },
  ],
  stories: [
    {
      id: "s1",
      label: "Why Crawler exists",
      text: "Assistants already answer questions about you. Without a maintained source they assemble the answer from whatever fragments they can find — an old bio, a stale price, a discontinued product. Crawler gives them one owner-approved, structured and current source instead.",
      confirmed: true,
    },
    {
      id: "s2",
      label: "How the interview works",
      text: "There is no fixed questionnaire. The first prompt is open: describe what you do or paste a link. Crawler infers the entity type, then asks only the questions that close real information gaps for that type of entity, and keeps asking as the Knowledge Core grows.",
      confirmed: true,
    },
    {
      id: "s3",
      label: "One core, many formats",
      text: "Everything is written once into the Knowledge Core. Files are generated from it, so llms.txt, the Markdown pages and the JSON endpoints can never drift apart — updating the core republishes a consistent set.",
      confirmed: true,
    },
    {
      id: "s4",
      label: "Honesty as a product rule",
      text: "Crawler shows only what it actually measured, labels demo data as demo, and states plainly what it cannot know. Nothing in the product implies visibility into private assistant conversations or promises AI citations.",
      confirmed: true,
    },
    {
      id: "s5",
      label: "Accountless by design",
      text: "No registration, no login, no profile. Ownership is a capability: whoever holds the recovery code controls the Presence. Less identity data to store means less to lose.",
      confirmed: true,
    },
  ],
  items: [
    {
      id: "o1",
      kind: "offering",
      name: "Plus — publish and stay online",
      summary: "Hosting for one published Presence with up to 10 content records, monthly source checks and 7-day basic measurement. Improvement recommendations are not included.",
      details: "$5 per month, recurring. Includes the public Presence URL, all generated AI-readable files, the public JSON endpoints and management via recovery code.",
      url: "https://crawler.today/pricing",
      tags: ["subscription", "hosting", "$5/month"],
    },
    {
      id: "o2",
      kind: "offering",
      name: "Pro — analyse, learn and improve",
      summary: "Everything in Plus plus the Improvement Loop, 90-day detailed insights, up to 200 content records, weekly source checks and a custom domain.",
      details: "$20 per month, recurring. The Improvement Loop turns measured accesses and Knowledge Core analysis into concrete, reviewable recommendations that the owner confirms before publishing.",
      url: "https://crawler.today/pricing",
      tags: ["subscription", "analytics", "$20/month"],
    },
    {
      id: "o3",
      kind: "offering",
      name: "Business — extensive data, continuously current",
      summary: "Everything in Pro plus up to 5,000 content records, unlimited measurement history, daily monitoring and source checks, scheduled report emails, shared team access and REST API access.",
      details: "$80 per month, recurring. Built for larger bodies of information that must stay current, and for teams that share management of one Presence through hashed team codes.",
      url: "https://crawler.today/pricing",
      tags: ["subscription", "team", "api", "$80/month"],
    },
    {
      id: "o4",
      kind: "offering",
      name: "Free creation and preview",
      summary: "The adaptive interview, the Knowledge Core and every generated file preview cost nothing and require no account.",
      details: "Anonymous draft sessions use cryptographically strong opaque tokens and expire after 30 days. You pay only when you want the Presence to be online.",
      url: "https://crawler.today/",
      tags: ["free", "no account"],
    },
    {
      id: "i1",
      kind: "service",
      name: "Adaptive AI interview",
      summary: "One open first prompt, then domain-specific follow-up questions derived from real information gaps rather than a fixed questionnaire.",
      details: "Crawler infers the entity type (person, creator, shop, product brand, manufacturer, company, project) and adapts the questions to it.",
      url: "https://crawler.today/",
    },
    {
      id: "i2",
      kind: "service",
      name: "Knowledge Core",
      summary: "One structured record holding identity, facts, positioning, offerings, projects, services, audiences, pricing, FAQs, news and sources.",
      details: "Verified facts stay separate from marketing claims, opinions, estimates and forecasts. Each entry carries an evidence status, a visibility level and an optional source.",
      url: "https://crawler.today/knowledge",
    },
    {
      id: "i3",
      kind: "service",
      name: "Knowledge Core Editor with AI assistant",
      summary: "Chat with an assistant that proposes structured changes, review them as green/blue/red diffs, restore earlier versions and archive outdated content.",
      details: "The assistant may only propose. Nothing is published without explicit owner confirmation. Sub-sections: Overview, Assistant, Data, Sources, Changes, History, Publication.",
      url: "https://crawler.today/knowledge",
    },
    {
      id: "i4",
      kind: "service",
      name: "AI-readable publishing",
      summary: "Generates llms.txt, llms-full.txt, about.md, offerings.md, projects.md, services.md, faq.md, audiences.md, pricing.md, news.md and cv.md plus JSON endpoints, served on stable public URLs.",
      details: "Files live under https://crawler.today/p/<slug>/ with correct content types, caching headers and clean alias paths under /c/<slug>/ for clients that reject query parameters.",
      url: "https://crawler.today/preview",
    },
    {
      id: "i5",
      kind: "service",
      name: "Presence analytics and Improvement Loop",
      summary: "Measured accesses, files read, outbound clicks and improvement potential over 7, 30, 90 days or the full period, with a trend chart and a most-read-content table.",
      details: "Only Crawler-observable events are shown, timestamps are UTC, empty periods are shown as honest empty states, and demo data is always labelled DEMO. The Improvement Loop is part of Pro and Business.",
      url: "https://crawler.today/analytics",
    },
    {
      id: "i6",
      kind: "service",
      name: "ChatGPT MCP connector",
      summary: "A public, no-auth MCP server at https://crawler.today/mcp so ChatGPT and other MCP clients can run the interview, build a core, preview files and retrieve published Presences.",
      details: "Auth type is none, so no ChatGPT account identity is passed to Crawler. Sessions use opaque tokens; durable drafts expire after 30 days.",
      url: "https://crawler.today/chatgpt",
    },
    {
      id: "i7",
      kind: "service",
      name: "CrawlMe API and retrieval endpoints",
      summary: "Public REST endpoints that let any AI client fetch a Presence summary, its records and its JSON entity data by slug or domain.",
      details: "Personalised copy-paste instructions and endpoint URLs are shown to the owner in /manage so they can hand them directly to an assistant.",
      url: "https://crawler.today/crawlme",
    },
    {
      id: "i8",
      kind: "service",
      name: "Accountless management",
      summary: "Update content, take a Presence offline, rotate the recovery code, configure a custom domain, manage team codes and cancel the subscription — all with a recovery code and no login.",
      details: "Destructive actions require an explicit confirmation dialog. Rotating the code invalidates the previous one immediately.",
      url: "https://crawler.today/manage",
    },
  ],
  faqs: [
    {
      id: "q1",
      question: "What is Crawler?",
      answer:
        "Crawler (crawler.today) is a digital SaaS product that turns scattered information about a person, creator, shop, product brand, manufacturer, company or project into one structured Knowledge Core and publishes it as AI-readable files on a stable public URL, so AI systems can read accurate, owner-approved information.",
    },
    {
      id: "q2",
      question: "How does the interview work?",
      answer:
        "There is no fixed questionnaire. The first prompt is open — describe what you do or paste a website or product link. Crawler infers the entity type and then asks domain-specific follow-up questions based on the actual information gaps, so different entities get different questions.",
    },
    {
      id: "q3",
      question: "Which files does Crawler publish?",
      answer:
        "From one Knowledge Core it generates llms.txt and llms-full.txt, Markdown pages (about.md, offerings.md, projects.md, services.md, faq.md, audiences.md, pricing.md, news.md, cv.md — only where relevant) and JSON endpoints such as api/entity.json, api/offerings.json, api/projects.json and api/services.json. They are served under https://crawler.today/p/<slug>/.",
    },
    {
      id: "q4",
      question: "What does it cost?",
      answer:
        "Creating and previewing is free. Hosting a published Presence costs Plus $5, Pro $20 or Business $80 per month, billed monthly and cancellable at any time.",
    },
    {
      id: "q5",
      question: "What is the difference between the plans?",
      answer:
        "Plus publishes and keeps one Presence online with 10 content records and 7-day basic measurement. Pro adds the Improvement Loop, 90-day detailed insights, 200 records, weekly source checks and a custom domain. Business adds 5,000 records, unlimited history, daily monitoring, report emails, shared team access and API access.",
    },
    {
      id: "q6",
      question: "Do I need an account?",
      answer:
        "No. There is no registration, no login, no OAuth and no user profile. A published Presence is controlled by a one-time recovery code of which Crawler stores only a hash.",
    },
    {
      id: "q7",
      question: "What happens if I lose my recovery code?",
      answer:
        "The Presence cannot be recovered, because Crawler stores only a hash of the code and never the code itself. The code is shown once at publish time and can be copied or downloaded then.",
    },
    {
      id: "q8",
      question: "What does Crawler measure?",
      answer:
        "Only Crawler-observable events: requests to your published Presence files and API endpoints, Crawler tool calls that reference your Presence, and outbound link clicks routed through Crawler. Timestamps are UTC and repeated identical events in a short window are deduplicated.",
    },
    {
      id: "q9",
      question: "What can Crawler not measure?",
      answer:
        "Private conversations inside ChatGPT, Claude, Gemini, Perplexity or any other assistant. Crawler has no access to them and never claims otherwise. All analytics are explicitly scoped as measured inside Crawler.",
    },
    {
      id: "q10",
      question: "Does Crawler guarantee that AI systems cite me?",
      answer:
        "No, and no product can. Crawler makes your information machine-readable, accurate, current and maintainable. Whether an external AI system reads, indexes or cites it is outside Crawler's control.",
    },
    {
      id: "q11",
      question: "Which data does Crawler store about visitors?",
      answer:
        "For analytics only the presence slug, the event type, a UTC timestamp, the source and an unlinkable HMAC-SHA-256 session fingerprint. No raw conversation text and no personal profiles.",
    },
    {
      id: "q12",
      question: "How do I connect Crawler to ChatGPT?",
      answer:
        "Add https://crawler.today/mcp as an MCP server in ChatGPT Developer Mode. The endpoint is public with auth type none, so no ChatGPT account identity is transmitted to Crawler.",
    },
    {
      id: "q13",
      question: "Can I use my own domain?",
      answer:
        "Yes, from the Pro plan onwards. Custom domains are configured in /manage with a verification token and serve the same generated files as the crawler.today Presence URL.",
    },
    {
      id: "q14",
      question: "Can a team manage one Presence?",
      answer:
        "Yes, on the Business plan. Shared team access uses hashed team codes so several people can manage the same Presence — still without any user accounts.",
    },
    {
      id: "q15",
      question: "How do I update or unpublish a Presence?",
      answer:
        "Open https://crawler.today/manage, enter <slug>~<recovery code>, then push updated content, rotate the code, take the Presence offline or cancel the subscription. Destructive actions ask for confirmation first.",
    },
    {
      id: "q16",
      question: "Is Crawler a physical product?",
      answer:
        "No. Crawler is a digital SaaS service delivered entirely over the internet. There is no shipping and no physical fulfilment.",
    },
    {
      id: "q17",
      question: "Who operates Crawler?",
      answer: "SEBKLAEY, based in Switzerland. Support runs through https://crawler.today/support and sebklay@me.com.",
    },
    {
      id: "q18",
      question: "How is Crawler different from an SEO tool?",
      answer:
        "SEO tools optimise pages for search rankings. Crawler maintains a structured, owner-confirmed source of truth in formats AI systems read directly, separates verified facts from positioning, and reports only what it can actually measure.",
    },
  ],
  cv: [],
  links: [
    { label: "Home — start the interview", url: "https://crawler.today/" },
    { label: "Pricing", url: "https://crawler.today/pricing" },
    { label: "ChatGPT connector", url: "https://crawler.today/chatgpt" },
    { label: "CrawlMe API", url: "https://crawler.today/crawlme" },
    { label: "Analytics", url: "https://crawler.today/analytics" },
    { label: "Knowledge Core editor", url: "https://crawler.today/knowledge" },
    { label: "Manage a Presence", url: "https://crawler.today/manage" },
    { label: "Support", url: "https://crawler.today/support" },
    { label: "Privacy", url: "https://crawler.today/privacy" },
    { label: "Terms", url: "https://crawler.today/terms" },
    { label: "Refunds", url: "https://crawler.today/refunds" },
    { label: "MCP endpoint", url: "https://crawler.today/mcp" },
  ],
  documents: [],
  gaps: [],
  ext: extension(),
  updatedAt: now,
});

let cache: GeneratedFile[] | null = null;

export function selfFiles(): GeneratedFile[] {
  cache ??= generatedFiles(crawlerCore());
  return cache;
}

export function selfFile(path: string): GeneratedFile | undefined {
  return selfFiles().find((f) => f.path === path);
}

const CONTENT_TYPE: Record<GeneratedFile["type"], string> = {
  json: "application/json; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  text: "text/plain; charset=utf-8",
};

/** Simple stable content hash for ETag / conditional requests. */
function etagOf(content: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < content.length; i++) {
    h1 = Math.imul(h1 ^ content.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + content.charCodeAt(i), 2654435761) >>> 0;
  }
  return `"${h1.toString(16)}${h2.toString(16)}-${content.length.toString(16)}"`;
}

/** Serves one of Crawler's own generated files on the canonical domain. */
export function serveSelfFile(path: string, request: Request): Response {
  const file = selfFile(path);
  if (!file) {
    return new Response(`File not found. Available: ${selfFiles().map((f) => f.path).join(", ")}`, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const etag = etagOf(file.content);
  const headers: Record<string, string> = {
    "content-type": CONTENT_TYPE[file.type],
    "cache-control": "public, max-age=300",
    etag,
    link: `<https://crawler.today/${path}>; rel="canonical", <https://crawler.today/llms.txt>; rel="describedby"`,
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(file.content, { headers });
}
