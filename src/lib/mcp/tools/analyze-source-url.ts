import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { allowRequest } from "../presences";

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(html: string, re: RegExp): string {
  const m = html.match(re);
  return m?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function headings(html: string): string[] {
  return [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => stripHtml(m[2] ?? ""))
    .filter((t) => t.length > 1)
    .slice(0, 25);
}

export default defineTool({
  name: "analyze_source_url",
  title: "Analyze a public URL",
  description:
    "Use this when the user pastes a website or landing-page URL. Crawler fetches the public page and returns its readable text, title, meta description and headings with provenance (source_url). Crawler runs no language model of its own — YOU extract the candidate facts from the returned text, keep hard facts separate from marketing narrative, and send them as core_update to continue_interview. If fetching fails or is blocked, an honest structured unavailable result is returned instead of invented data.",
  inputSchema: {
    url: z.string().url().describe("Public HTTPS URL to read."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ url }) => {
    if (!(await allowRequest("tool:analyze_source_url", 30)))
      return {
        content: [{ type: "text" as const, text: "Rate limited: too many URL analyses in the last minute. Try again shortly." }],
        isError: true as const,
      };
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

    try {
      const { recordMentionsFromInput } = await import("../presence-analytics");
      await recordMentionsFromInput(url);
    } catch {
      /* analytics must never break a URL analysis */
    }

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
        headers: { "user-agent": "CrawlerPresenceBot/1.0 (+https://crawler.today)", accept: "text/html" },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return unavailable(`HTTP ${res.status}`);
      html = (await res.text()).slice(0, 200000);
    } catch (e) {
      return unavailable(`fetch failed (${String((e as Error).message ?? e)})`);
    }

    const text = stripHtml(html).slice(0, 12000);
    if (text.length < 40) return unavailable("page returned no readable text (likely JavaScript-rendered)");

    const title = pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description =
      pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      pick(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const ogTitle = pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);

    return {
      content: [
        {
          type: "text",
          text: `Read ${url} (${text.length} characters of readable text). Crawler does not interpret it — extract the checkable facts yourself, keep marketing copy as narrative, and send them as core_update to continue_interview. Everything still needs the user's confirmation.`,
        },
      ],
      structuredContent: {
        available: true,
        source_url: url,
        fetched_at: new Date().toISOString(),
        no_own_model: true,
        title,
        og_title: ogTitle,
        meta_description: description,
        headings: headings(html),
        page_text: text,
        extraction_instructions:
          "Only report what the page actually states. Separate hard facts (status 'verified' only when the page states them plainly) from marketing narrative (stories / status 'claimed'). Never invent prices, numbers, awards or clients. Set source to this URL on every extracted fact.",
        candidate_facts: [],
      },
    };
  },
});
