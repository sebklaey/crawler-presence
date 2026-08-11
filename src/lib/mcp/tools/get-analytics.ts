import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { generateJson } from "../../ai-gateway.server";
import { demoDays, demoEntities, demoMissing, demoSources, demoTopics, totals, windowRows } from "../../demo-analytics";
import { getSession } from "../sessions";

const summarySchema = z.object({
  headline: z.string(),
  recurringQuestions: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
  improvements: z.array(z.object({ action: z.string(), impact: z.string() })).default([]),
});

const METRIC_DEFINITIONS = {
  conversations: "Distinct Crawler conversations that touched this presence.",
  queries: "Individual questions asked against the presence inside Crawler.",
  appearances: "Times the entity or one of its catalog items was surfaced in a Crawler answer.",
  outbound_clicks: "Clicks on trackable outbound links in the published presence.",
  crawler_reads: "Observable fetches of llms.txt / markdown / JSON files by crawlers and agents.",
  sources: "Referrer and UTM values, only where the caller supplied them.",
};

const NOT_MEASURABLE =
  "Crawler cannot see private conversations inside ChatGPT, Claude, Gemini, Perplexity or any other external assistant. Only Crawler-internal events and observable reads of the published files are measurable.";

export default defineTool({
  name: "get_analytics",
  title: "Get Presence analytics (demo)",
  description:
    "Use this when the user asks how their Presence is performing, what people ask about it, or for analytics over the last 7/30/90 days. In this no-auth MVP it returns clearly labelled seeded DEMO analytics plus session-local metrics — never private data and never external AI assistant conversations.",
  inputSchema: {
    session_id: z.string().trim().min(6).optional().describe("Optional Crawler session for session-local metrics."),
    period_days: z
      .union([z.literal(7), z.literal(30), z.literal(90)])
      .default(30)
      .describe("Analytics window in days."),
    filter: z
      .string()
      .trim()
      .optional()
      .describe("Optional product or entity name filter, e.g. 'gravel bikes' or 'Product X'."),
    include_ai_summary: z.boolean().default(true).describe("Include the AI summary of recurring questions and gaps."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ session_id, period_days, filter, include_ai_summary }) => {
    const days = period_days ?? 30;
    const rows = windowRows(demoDays(90), days);
    const t = totals(rows);
    const match = (label: string) => (filter ? label.toLowerCase().includes(filter.toLowerCase()) : true);
    const topics = demoTopics.filter((x) => match(x.label));
    const entities = demoEntities.filter((x) => match(x.label));

    const session = session_id ? await getSession(session_id) : undefined;
    const dataset = {
      period_days: days,
      filter: filter ?? null,
      totals: t,
      daily: rows,
      top_topics: topics,
      top_entities: entities,
      sources: demoSources,
      known_gaps: demoMissing,
    };

    let summary: z.infer<typeof summarySchema> | null = null;
    if (include_ai_summary !== false) {
      try {
        summary = await generateJson({
          schema: summarySchema as unknown as z.ZodType<z.infer<typeof summarySchema>>,
          shape: `{"headline":"","recurringQuestions":["max 5"],"missingInformation":["max 5"],"improvements":[{"action":"","impact":""}]}`,
          system:
            "You summarise Crawler presence analytics: recurring questions, information the presence is missing, and concrete improvements to the Knowledge Core. Use only the dataset. Never reference external AI assistant conversations as a data source. Say once that the data is seeded demo data.",
          prompt: `Dataset (JSON):\n${JSON.stringify(dataset).slice(0, 12000)}`,
        });
      } catch {
        summary = null;
      }
    }

    return {
      content: [
        {
          type: "text",
          text: `DEMO analytics, last ${days} days${filter ? ` (filter: ${filter})` : ""}: ${t.conversations} conversations, ${t.queries} queries, ${t.appearances} appearances, ${t.outboundClicks} outbound clicks, ${t.crawlerReads} crawler reads.${summary ? `\n\n${summary.headline}` : ""}`,
        },
      ],
      structuredContent: {
        data_mode: "demo",
        demo_notice: "These numbers are seeded demo data, not real traffic. Real analytics require a published presence and a linked account.",
        not_measurable: NOT_MEASURABLE,
        metric_definitions: METRIC_DEFINITIONS,
        period_days: days,
        filter: filter ?? null,
        totals: t,
        top_topics: topics,
        top_entities: entities,
        sources: demoSources,
        session_local: session
          ? {
              session_id: session.id,
              interview_turns: session.transcript.length,
              knowledge_core_gaps: session.core.gaps,
              confidence: session.confidence,
            }
          : null,
        ai_summary: summary,
      },
    };
  },
});
