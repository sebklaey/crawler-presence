import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { CRAWLER_MODEL, requireGateway } from "./ai-gateway.server";

const answerSchema = z.object({
  intent: z.string().describe("Short label of the detected intent, e.g. 'Traffic, last 7 days'"),
  answer: z.string().describe("2-4 sentences answering with the numbers from the dataset."),
  metrics: z.array(z.object({ label: z.string(), value: z.string() })).max(4),
  caveat: z.string().describe("What this data cannot show. Always mention external AI chats are not measurable."),
});

export const askAnalytics = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ question: z.string().min(2).max(500), dataset: z.unknown() }).parse(input),
  )
  .handler(async ({ data }) => {
    const gateway = requireGateway();
    const result = await generateObject({
      model: gateway(CRAWLER_MODEL),
      schema: answerSchema,
      system: `You answer natural-language analytics questions using ONLY the provided Crawler dataset.
Measurable: entity/product appearances inside Crawler, Crawler conversation and query counts, trackable outbound link clicks, UTM/referrer data, and crawler/read events on the published presence.
NOT measurable, never claim it: private conversations inside ChatGPT, Claude, Gemini, Perplexity or any external assistant.
If the dataset cannot answer the question, say so plainly. Never invent numbers. The dataset is seeded demo data — mention that once in the caveat.`,
      prompt: `Dataset (JSON):\n${JSON.stringify(data.dataset).slice(0, 12000)}\n\nQuestion: ${data.question}`,
    });
    return result.object;
  });

const summarySchema = z.object({
  headline: z.string(),
  recurringQuestions: z.array(z.string()).max(5),
  missingInformation: z.array(z.string()).max(5),
  improvements: z.array(z.object({ action: z.string(), impact: z.string() })).max(5),
});

export const analyticsSummary = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ dataset: z.unknown() }).parse(input))
  .handler(async ({ data }) => {
    const gateway = requireGateway();
    const result = await generateObject({
      model: gateway(CRAWLER_MODEL),
      schema: summarySchema,
      system:
        "You summarise Crawler presence analytics: recurring questions, information the presence is missing, and concrete improvements to the Knowledge Core. Use only the dataset. Never reference external AI assistant conversations as a data source.",
      prompt: `Dataset (JSON):\n${JSON.stringify(data.dataset).slice(0, 12000)}`,
    });
    return result.object;
  });
