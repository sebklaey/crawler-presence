/**
 * Crawler's own public AI Presence.
 *
 * Built from the same Knowledge Core generator every customer Presence uses, so
 * the canonical domain serves real, generated files — not hand-written copies.
 * Every fact here must be true of the deployed product.
 */
import { type GeneratedFile, type KnowledgeCore, generatedFiles } from "./knowledge";

const now = "2026-08-12T00:00:00.000Z";

export const crawlerCore = (): KnowledgeCore => ({
  entityType: "company",
  name: "Crawler",
  tagline: "Turn scattered business information into one verified, continuously updated AI Presence.",
  summary:
    "Crawler interviews you adaptively, builds one structured Knowledge Core that separates verified facts from positioning, and publishes it in human- and AI-readable formats (llms.txt, Markdown and JSON endpoints). Creating and previewing is free; hosting a published Presence is the paid step. Crawler measures what it can observe itself — reads of your published Presence files and Crawler tool interactions — and never claims access to private ChatGPT, Claude, Gemini or other assistant conversations, and never guarantees rankings, indexing, citations or mentions by external AI systems.",
  website: "https://crawler.today",
  languages: ["en", "de"],
  facts: [
    { id: "f1", label: "Product", value: "Digital SaaS hosting for AI-readable presence files", status: "verified" },
    { id: "f2", label: "Plans", value: "Plus $5/month, Pro $20/month, Business $80/month", status: "verified" },
    { id: "f3", label: "Free", value: "Adaptive interview, Knowledge Core and all file previews are free", status: "verified" },
    { id: "f4", label: "Accounts", value: "No registration and no login; a published Presence is controlled by a one-time recovery code", status: "verified" },
    { id: "f5", label: "MCP endpoint", value: "https://crawler.today/mcp (public, no auth)", status: "verified" },
    { id: "f6", label: "Published presence URL", value: "https://crawler.today/p/<slug>", status: "verified" },
    { id: "f7", label: "Support", value: "https://crawler.today/support", status: "verified" },
    { id: "f8", label: "Physical goods", value: "None — no shipping, no fulfilment, digital service only", status: "verified" },
  ],
  stories: [
    {
      id: "s1",
      label: "Why Crawler exists",
      text: "Assistants answer questions about you from whatever they can find. Crawler gives them one maintained, owner-approved source instead of scattered fragments.",
      confirmed: true,
    },
  ],
  items: [
    {
      id: "i1",
      kind: "service",
      name: "Adaptive AI interview",
      summary: "One open first prompt, then domain-specific follow-up questions based on real information gaps.",
      url: "https://crawler.today/",
    },
    {
      id: "i2",
      kind: "service",
      name: "Knowledge Core",
      summary: "One structured record that keeps verified facts separate from positioning and storytelling.",
      url: "https://crawler.today/knowledge",
    },
    {
      id: "i3",
      kind: "service",
      name: "AI-readable publishing",
      summary: "Generates llms.txt, llms-full.txt, about.md and JSON endpoints, served on stable public URLs.",
      url: "https://crawler.today/preview",
    },
    {
      id: "i4",
      kind: "service",
      name: "Presence analytics",
      summary: "Measured reads of your published Presence files and Crawler tool interactions only.",
      url: "https://crawler.today/analytics",
    },
    {
      id: "i5",
      kind: "service",
      name: "ChatGPT MCP connector",
      summary: "Public no-auth MCP server so ChatGPT can build and preview a Presence directly.",
      url: "https://crawler.today/chatgpt",
    },
  ],
  faqs: [
    {
      id: "q1",
      question: "What does Crawler measure?",
      answer:
        "Only Crawler-observable events: requests to your published Presence files and API endpoints, Crawler tool calls that reference your Presence, and outbound link clicks routed through Crawler.",
    },
    {
      id: "q2",
      question: "What can Crawler not measure?",
      answer:
        "Private conversations inside ChatGPT, Claude, Gemini, Perplexity or any other assistant. Crawler cannot see them and never claims to.",
    },
    {
      id: "q3",
      question: "Does Crawler guarantee that AI systems cite me?",
      answer: "No. No product can. Crawler makes your information machine-readable, accurate and maintainable.",
    },
    {
      id: "q4",
      question: "Do I need an account?",
      answer:
        "No. There is no registration and no login. A published Presence is managed with a one-time recovery code, of which Crawler stores only a hash.",
    },
    {
      id: "q5",
      question: "What is free?",
      answer: "Creating and previewing a Presence is free. You pay only to keep it published and hosted.",
    },
  ],
  cv: [],
  links: [
    { label: "Pricing", url: "https://crawler.today/pricing" },
    { label: "ChatGPT connector", url: "https://crawler.today/chatgpt" },
    { label: "Support", url: "https://crawler.today/support" },
    { label: "Privacy", url: "https://crawler.today/privacy" },
    { label: "Terms", url: "https://crawler.today/terms" },
  ],
  documents: [],
  gaps: [],
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
