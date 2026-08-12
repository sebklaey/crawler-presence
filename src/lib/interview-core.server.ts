import { z } from "zod";
import { generateJson } from "./ai-gateway.server";
import { emptyCore, type KnowledgeCore } from "./knowledge";

export const factSchema = z.object({
  label: z.string(),
  value: z.string(),
  status: z.enum(["verified", "claimed"]).default("claimed"),
  source: z.string().optional(),
});

export const itemSchema = z.object({
  kind: z.enum(["offering", "project", "service"]),
  name: z.string(),
  summary: z.string(),
  details: z.string().optional(),
  url: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const coreSchema = z.object({
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

export const turnSchema = z.object({
  reply: z.string(),
  question: z.string(),
  suggestions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  interviewComplete: z.boolean().default(false),
  core: coreSchema,
});

export type InterviewTurn = z.infer<typeof turnSchema>;

export const CORE_SHAPE = `{
  "reply": "short acknowledgement, max 2 sentences, no lists",
  "question": "ONE domain-specific follow-up question (empty string only when interviewComplete is true)",
  "suggestions": ["up to 3 short example answers the user could tap"],
  "confidence": 0.0,
  "interviewComplete": false,
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

export const SYSTEM = `You are Crawler, an adaptive interviewer that builds an AI-readable public Presence (a Knowledge Core) for a person, creator, studio, company, organization or project. Crawler only publishes text; it never handles orders, shipping or physical goods.

Rules:
- Never use a fixed questionnaire. Infer the entity type from what the user wrote (including any pasted website or product link) and ask exactly ONE intelligent, domain-specific follow-up question that closes the biggest current information gap.
- A photographer, a design studio, a SaaS company and an open-source project must get very different questions: a photographer about genres, clients and licensing; a studio about disciplines, process and engagement models; a SaaS about pricing tiers, integrations and data handling; a project about scope, roadmap and contribution.
- Never ask about, record or publish shipping, delivery, postage, returns of physical items, stock or warehousing. Crawler describes digital and service offerings only.
- Separate hard facts from storytelling. Anything the user stated plainly is a fact with status "verified". Anything you inferred, wrote yourself, or that is marketing positioning is status "claimed" (facts) or an unconfirmed story.
- Never invent offerings, numbers, prices, awards or clients. If unknown, add it to "gaps" instead.
- Keep the whole updated Knowledge Core in the response: merge new information into what already exists, never drop existing entries unless the user corrected them.
- "confidence" is your 0-1 confidence that the Knowledge Core is accurate and sufficient for AI assistants.
- Set "interviewComplete" to true only when identity, summary, at least three verified facts, catalog (if applicable), FAQ and a contact link are all present.
- Write summaries in the user's language.
- Keep "reply" warm, calm and brief.`;

/**
 * Deterministischer Interview-Schritt — Crawler nutzt kein eigenes Modell.
 * Die adaptive Formulierung übernimmt das aufrufende Modell (ChatGPT via MCP);
 * hier wird nur regelbasiert zusammengeführt und die nächste Lücke bestimmt.
 */
export async function runInterviewTurn({
  core,
  answer,
}: {
  core: unknown;
  answer: string;
}): Promise<InterviewTurn> {
  const { interviewStep } = await import("./interview-rules");
  const step = interviewStep({ core, message: answer });
  return turnSchema.parse({
    reply: step.reply,
    question: step.question,
    suggestions: step.suggestions,
    confidence: step.confidence,
    interviewComplete: step.interviewComplete,
    core: step.core,
  }) as InterviewTurn;
}


const rid = () => Math.random().toString(36).slice(2, 10);

/** Drop undefined values so exactOptionalPropertyTypes stays satisfied. */
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** Turn the model's loose core into the app's KnowledgeCore (adds ids + timestamp). */
export function toKnowledgeCore(raw: z.infer<typeof coreSchema>): KnowledgeCore {
  const base = emptyCore();
  return {
    ...base,
    entityType: raw.entityType,
    name: raw.name,
    tagline: raw.tagline,
    summary: raw.summary,
    ...(raw.location ? { location: raw.location } : {}),
    ...(raw.website ? { website: raw.website } : {}),
    ...(raw.languages ? { languages: raw.languages } : {}),
    facts: raw.facts.map((f) => clean({ id: rid(), ...f })) as KnowledgeCore["facts"],
    stories: raw.stories.map((s) => ({ id: rid(), ...s })),
    items: raw.items.map((i) => clean({ id: rid(), ...i })) as KnowledgeCore["items"],
    faqs: raw.faqs.map((f) => ({ id: rid(), ...f })),
    cv: raw.cv.map((e) => clean({ id: rid(), ...e })) as KnowledgeCore["cv"],
    links: raw.links,
    gaps: raw.gaps,
    updatedAt: new Date().toISOString(),
  };
}
