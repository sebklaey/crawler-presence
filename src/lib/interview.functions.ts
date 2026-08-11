import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateJson } from "./ai-gateway.server";

const factSchema = z.object({
  label: z.string(),
  value: z.string(),
  status: z.enum(["verified", "claimed"]).catch("claimed"),
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
  entityType: z
    .enum(["person", "creator", "shop", "product-brand", "manufacturer", "company", "project", "unknown"])
    .catch("unknown"),
  name: z.string().catch(""),
  tagline: z.string().catch(""),
  summary: z.string().catch(""),
  location: z.string().optional(),
  website: z.string().optional(),
  languages: z.array(z.string()).optional(),
  facts: z.array(factSchema).catch([]),
  stories: z
    .array(z.object({ label: z.string(), text: z.string(), confirmed: z.boolean().catch(false) }))
    .catch([]),
  items: z.array(itemSchema).catch([]),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })).catch([]),
  cv: z
    .array(
      z.object({
        role: z.string(),
        organization: z.string().optional(),
        period: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .catch([]),
  links: z.array(z.object({ label: z.string(), url: z.string() })).catch([]),
  gaps: z.array(z.string()).catch([]),
});

const turnSchema = z.object({
  reply: z.string(),
  question: z.string(),
  suggestions: z.array(z.string()).catch([]),
  core: coreSchema,
});

const CORE_SHAPE = `{
  "reply": "short acknowledgement, max 2 sentences, no lists",
  "question": "ONE domain-specific follow-up question",
  "suggestions": ["up to 3 short example answers the user could tap"],
  "core": {
    "entityType": "person|creator|shop|product-brand|manufacturer|company|project|unknown",
    "name": "", "tagline": "", "summary": "", "location": "", "website": "", "languages": [],
    "facts": [{"label": "", "value": "", "status": "verified|claimed", "source": ""}],
    "stories": [{"label": "", "text": "", "confirmed": false}],
    "items": [{"kind": "product|project|service", "name": "", "summary": "", "details": "", "url": "", "tags": []}],
    "faqs": [{"question": "", "answer": ""}],
    "cv": [{"role": "", "organization": "", "period": "", "note": ""}],
    "links": [{"label": "", "url": ""}],
    "gaps": ["information still missing"]
  }
}`;

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
    const transcript = [...data.history, { role: "user" as const, content: data.message }]
      .map((m) => `${m.role === "user" ? "USER" : "CRAWLER"}: ${m.content}`)
      .join("\n\n");

    return await generateJson({
      schema: turnSchema,
      shape: CORE_SHAPE,
      system: SYSTEM,
      prompt: `Current Knowledge Core (JSON):\n${JSON.stringify(data.core ?? {}, null, 2)}\n\nConversation so far:\n${transcript}\n\nReturn the acknowledgement, the single next question and the fully merged Knowledge Core.`,
    });
  });

const improveSchema = z.object({
  headline: z.string(),
  strengths: z.array(z.string()).catch([]),
  missing: z.array(z.string()).catch([]),
  suggestions: z.array(z.object({ title: z.string(), why: z.string() })).catch([]),
});

export const improvePresence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ core: z.unknown() }).parse(input))
  .handler(async ({ data }) => {
    return await generateJson({
      schema: improveSchema,
      shape: `{"headline": "", "strengths": [""], "missing": [""], "suggestions": [{"title": "", "why": ""}]}`,
      system:
        "You review an AI-readable Presence Knowledge Core and say precisely what is missing for AI assistants to answer questions about this entity well. Be concrete and specific to the entity type. Never invent facts.",
      prompt: `Knowledge Core:\n${JSON.stringify(data.core, null, 2)}`,
    });
  });
