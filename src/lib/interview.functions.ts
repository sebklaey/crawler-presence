import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { CRAWLER_MODEL, requireGateway } from "./ai-gateway.server";

const factSchema = z.object({
  label: z.string(),
  value: z.string(),
  status: z.enum(["verified", "claimed"]),
  source: z.string().optional(),
});

const itemSchema = z.object({
  kind: z.enum(["product", "project", "service"]),
  name: z.string(),
  summary: z.string(),
  details: z.string().optional(),
  url: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const coreSchema = z.object({
  entityType: z.enum([
    "person",
    "creator",
    "shop",
    "product-brand",
    "manufacturer",
    "company",
    "project",
    "unknown",
  ]),
  name: z.string(),
  tagline: z.string(),
  summary: z.string(),
  location: z.string().optional(),
  website: z.string().optional(),
  languages: z.array(z.string()).optional(),
  facts: z.array(factSchema),
  stories: z.array(z.object({ label: z.string(), text: z.string(), confirmed: z.boolean() })),
  items: z.array(itemSchema),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })),
  cv: z.array(
    z.object({
      role: z.string(),
      organization: z.string().optional(),
      period: z.string().optional(),
      note: z.string().optional(),
    }),
  ),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
  gaps: z.array(z.string()),
});

const turnSchema = z.object({
  reply: z.string().describe("Short acknowledgement, max 2 sentences. No lists."),
  question: z.string().describe("One single, domain-specific follow-up question."),
  suggestions: z.array(z.string()).max(3).describe("Up to 3 short example answers the user could tap."),
  core: coreSchema,
});

const SYSTEM = `You are Crawler, an adaptive interviewer that builds an AI-readable public Presence (a Knowledge Core) for a person, creator, shop, product brand, manufacturer, company or project.

Rules:
- Never use a fixed questionnaire. Infer the entity type from what the user wrote (including any pasted website or product link) and ask exactly ONE intelligent, domain-specific follow-up question that closes the biggest current information gap.
- A photographer, a handmade beauty shop and a bike manufacturer must get very different questions. A manufacturer with many models should be asked about model families, sizes, specs; a photographer about genres, clients, licensing; a shop about ingredients, shipping, returns.
- Separate hard facts from storytelling. Anything the user stated plainly is a fact with status "verified". Anything you inferred, wrote yourself, or that is marketing positioning is status "claimed" (facts) or an unconfirmed story.
- Never invent products, numbers, prices, awards or clients. If unknown, add it to "gaps" instead.
- Keep the whole updated Knowledge Core in the response: merge new information into what already exists, never drop existing entries unless the user corrected them.
- Write summaries in the user's language.
- Keep "reply" warm, calm and brief.`;

export const interviewTurn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        message: z.string().min(1).max(6000),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) }))
          .max(40)
          .default([]),
        core: z.unknown().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const gateway = requireGateway();
    const transcript = [...data.history, { role: "user" as const, content: data.message }]
      .map((m) => `${m.role === "user" ? "USER" : "CRAWLER"}: ${m.content}`)
      .join("\n\n");

    const result = await generateObject({
      model: gateway(CRAWLER_MODEL),
      schema: turnSchema,
      system: SYSTEM,
      prompt: `Current Knowledge Core (JSON):\n${JSON.stringify(data.core ?? {}, null, 2)}\n\nConversation so far:\n${transcript}\n\nReturn the acknowledgement, the single next question and the fully merged Knowledge Core.`,
    });

    return result.object;
  });

const improveSchema = z.object({
  headline: z.string(),
  strengths: z.array(z.string()).max(4),
  missing: z.array(z.string()).max(6),
  suggestions: z.array(z.object({ title: z.string(), why: z.string() })).max(5),
});

export const improvePresence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ core: z.unknown() }).parse(input))
  .handler(async ({ data }) => {
    const gateway = requireGateway();
    const result = await generateObject({
      model: gateway(CRAWLER_MODEL),
      schema: improveSchema,
      system:
        "You review an AI-readable Presence Knowledge Core and say precisely what is missing for AI assistants to answer questions about this entity well. Be concrete and specific to the entity type. Never invent facts.",
      prompt: `Knowledge Core:\n${JSON.stringify(data.core, null, 2)}`,
    });
    return result.object;
  });
