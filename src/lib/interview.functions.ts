import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateJson } from "./ai-gateway.server";

const factSchema = z.object({
  label: z.string(),
  value: z.string(),
  status: z.enum(["verified", "claimed"]).default("claimed"),
  source: z.string().optional(),
});

const itemSchema = z.object({
  kind: z.enum(["offering", "project", "service"]),
  name: z.string(),
  summary: z.string(),
  details: z.string().optional(),
  url: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const coreSchema = z.object({
  entityType: z
    .enum(["person", "creator", "studio", "company", "organization", "project", "unknown"])
    .default("unknown"),
  name: z.string().default(""),
  tagline: z.string().default(""),
  summary: z.string().default(""),
  location: z.string().optional(),
  website: z.string().optional(),
  languages: z.array(z.string()).optional(),
  facts: z.array(factSchema).default([]),
  stories: z
    .array(z.object({ label: z.string(), text: z.string(), confirmed: z.boolean().default(false) }))
    .default([]),
  items: z.array(itemSchema).default([]),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
  cv: z
    .array(
      z.object({
        role: z.string(),
        organization: z.string().optional(),
        period: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .default([]),
  links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  gaps: z.array(z.string()).default([]),
});

const turnSchema = z.object({
  reply: z.string(),
  question: z.string(),
  suggestions: z.array(z.string()).default([]),
  core: coreSchema,
});

const CORE_SHAPE = `{
  "reply": "short acknowledgement, max 2 sentences, no lists",
  "question": "ONE domain-specific follow-up question",
  "suggestions": ["up to 3 short example answers the user could tap"],
  "core": {
    "entityType": "person|creator|studio|company|organization|project|unknown",
    "name": "", "tagline": "", "summary": "", "location": "", "website": "", "languages": [],
    "facts": [{"label": "", "value": "", "status": "verified|claimed", "source": ""}],
    "stories": [{"label": "", "text": "", "confirmed": false}],
    "items": [{"kind": "offering|project|service", "name": "", "summary": "", "details": "", "url": "", "tags": []}],
    "faqs": [{"question": "", "answer": ""}],
    "cv": [{"role": "", "organization": "", "period": "", "note": ""}],
    "links": [{"label": "", "url": ""}],
    "gaps": ["information still missing"]
  }
}`;

const SYSTEM = `You are Crawler, an adaptive interviewer that builds an AI-readable public Presence (a Knowledge Core) for a person, creator, studio, company, organization or project. Crawler only publishes text; it never handles orders, shipping or physical goods.

Rules:
- Never use a fixed questionnaire. Infer the entity type from what the user wrote (including any pasted website or product link) and ask exactly ONE intelligent, domain-specific follow-up question that closes the biggest current information gap.
- A photographer, a design studio, a SaaS company and an open-source project must get very different questions: a photographer about genres, clients and licensing; a studio about disciplines, process and engagement models; a SaaS about pricing tiers, integrations and data handling; a project about scope, roadmap and contribution.
- Never ask about, record or publish shipping, delivery, postage, returns of physical items, stock or warehousing. Crawler describes digital and service offerings only.
- Separate hard facts from storytelling. Anything the user stated plainly is a fact with status "verified". Anything you inferred, wrote yourself, or that is marketing positioning is status "claimed" (facts) or an unconfirmed story.
- Never invent offerings, numbers, prices, awards or clients. If unknown, add it to "gaps" instead.
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
  strengths: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
  suggestions: z.array(z.object({ title: z.string(), why: z.string() })).default([]),
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
