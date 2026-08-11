import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { generateJson } from "../../ai-gateway.server";

const schema = z.object({
  entity_type_guess: z.string().default("unknown"),
  name: z.string().default(""),
  summary: z.string().default(""),
  candidate_facts: z
    .array(z.object({ label: z.string(), value: z.string(), confidence: z.number().min(0).max(1).default(0.5) }))
    .default([]),
  candidate_items: z
    .array(z.object({ kind: z.string().default("product"), name: z.string(), summary: z.string().default("") }))
    .default([]),
  narrative: z.array(z.string()).default([]),
  missing_information: z.array(z.string()).default([]),
});

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default defineTool({
  name: "analyze_source_url",
  title: "Analyze a public URL",
  description:
    "Use this when the user pastes a website or product URL and wants Crawler to extract candidate facts from the public page. Returns extracted information with provenance (source_url) and per-fact confidence. If fetching fails or is blocked, returns an honest structured unavailable result instead of invented data.",
  inputSchema: {
    url: z.string().url().describe("Public HTTPS URL to read."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ url }) => {
    const unavailable = (reason: string) => ({
      content: [{ type: "text" as const, text: `Could not read ${url}: ${reason}. No facts were invented.` }],
      structuredContent: {
        available: false,
        source_url: url,
        reason,
        candidate_facts: [],
        note: "Ask the user to describe the page content instead; Crawler never fabricates facts from an unreadable source.",
      },
    });

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return unavailable("invalid URL");
    }
    if (parsed.protocol !== "https:") return unavailable("only https URLs are fetched");

    let html: string;
    try {
      const res = await fetch(parsed.toString(), {
        redirect: "follow",
        headers: { "user-agent": "CrawlerPresenceBot/1.0 (+https://crawler.lovable.app)", accept: "text/html" },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return unavailable(`HTTP ${res.status}`);
      html = (await res.text()).slice(0, 200000);
    } catch (e) {
      return unavailable(`fetch failed (${String((e as Error).message ?? e)})`);
    }

    const text = stripHtml(html).slice(0, 12000);
    if (text.length < 40) return unavailable("page returned no readable text (likely JavaScript-rendered)");

    let extracted;
    try {
      extracted = await generateJson({
        schema,
        shape: `{"entity_type_guess":"","name":"","summary":"","candidate_facts":[{"label":"","value":"","confidence":0.0}],"candidate_items":[{"kind":"product|project|service","name":"","summary":""}],"narrative":["marketing/positioning copy found on the page"],"missing_information":[""]}`,
        system:
          "You extract structured, checkable information from a public web page for an AI-readable presence. Only report what the page actually states. Separate hard facts from marketing narrative. Never invent prices, numbers, awards or clients. Lower confidence when the page is ambiguous.",
        prompt: `Source URL: ${url}\n\nPage text:\n${text}`,
      });
    } catch (e) {
      return unavailable(`extraction model unavailable (${String((e as Error).message ?? e)})`);
    }

    return {
      content: [
        {
          type: "text",
          text: `Read ${url}. Found ${extracted.candidate_facts.length} candidate facts and ${extracted.candidate_items.length} catalog candidates. All values still need user confirmation.`,
        },
      ],
      structuredContent: {
        available: true,
        source_url: url,
        fetched_at: new Date().toISOString(),
        ...extracted,
        candidate_facts: extracted.candidate_facts.map((f) => ({ ...f, source_url: url, status: "claimed" })),
      },
    };
  },
});
