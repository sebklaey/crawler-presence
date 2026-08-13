import { z } from "zod";
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
  documents: z
    .array(
      z.object({
        title: z.string(),
        text: z.string(),
        source: z.string().optional(),
        addedAt: z.string().optional(),
      }),
    )
    .default([]),
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
