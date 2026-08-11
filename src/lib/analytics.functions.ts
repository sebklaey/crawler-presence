import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateJson } from "./ai-gateway.server";

const answerSchema = z.object({
  intent: z.string(),
  answer: z.string(),
  metrics: z.array(z.object({ label: z.string(), value: z.string() })).catch([]),
  caveat: z.string().catch(""),
});

export const askAnalytics = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ question: z.string().min(2).max(500), dataset: z.unknown() }).parse(input),
  )
  .handler(async ({ data }) => {
    return await generateJson({
      schema: answerSchema,
      shape: `{"intent": "short label of the detected intent", "answer": "2-4 sentences using the dataset numbers", "metrics": [{"label": "", "value": ""}], "caveat": "what this data cannot show"}`,
      system: `You answer natural-language analytics questions using ONLY the provided Crawler dataset.
Measurable: entity/product appearances inside Crawler, Crawler conversation and query counts, trackable outbound link clicks, UTM/referrer data, and crawler/read events on the published presence.
NOT measurable, never claim it: private conversations inside ChatGPT, Claude, Gemini, Perplexity or any external assistant.
If the dataset cannot answer the question, say so plainly. Never invent numbers. The dataset is seeded demo data — mention that once in the caveat.`,
      prompt: `Dataset (JSON):\n${JSON.stringify(data.dataset).slice(0, 12000)}\n\nQuestion: ${data.question}`,
    });
  });

const summarySchema = z.object({
  headline: z.string(),
  recurringQuestions: z.array(z.string()).catch([]),
  missingInformation: z.array(z.string()).catch([]),
  improvements: z.array(z.object({ action: z.string(), impact: z.string() })).catch([]),
});

export const analyticsSummary = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ dataset: z.unknown() }).parse(input))
  .handler(async ({ data }) => {
    return await generateJson({
      schema: summarySchema,
      shape: `{"headline": "", "recurringQuestions": ["max 5"], "missingInformation": ["max 5"], "improvements": [{"action": "", "impact": ""}]}`,
      system:
        "You summarise Crawler presence analytics: recurring questions, information the presence is missing, and concrete improvements to the Knowledge Core. Use only the dataset. Never reference external AI assistant conversations as a data source.",
      prompt: `Dataset (JSON):\n${JSON.stringify(data.dataset).slice(0, 12000)}`,
    });
  });
