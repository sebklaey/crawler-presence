/**
 * Knowledge Core Editor — ChatGPT-powered proposal engine.
 *
 * The model may only PROPOSE changes. It never writes into the Knowledge Core
 * and it never publishes: every proposal is applied by the user in the browser
 * workspace, and publishing stays an explicit separate confirmation.
 *
 * Accountless: no identity is sent, only the Knowledge Core the user is editing.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { SECTION_KEYS, EVIDENCE_STATUSES, VISIBILITIES } from "./model";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
});

const inputSchema = z.object({
  core: z.unknown(),
  messages: z.array(messageSchema).max(40),
});

export type KcProposalDraft = {
  action: "add" | "update" | "archive" | "restore" | "delete";
  section: string;
  target: string;
  label: string;
  proposed_value: string;
  reason: string;
  evidence_status: string;
  visibility: string;
  confidence: "low" | "medium" | "high";
  source: string;
  warnings: string[];
};

export type KcAssistantResult =
  | { ok: false; reason: string }
  | { ok: true; reply: string; question: string; proposals: KcProposalDraft[] };

const proposalSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "action",
    "section",
    "target",
    "label",
    "proposed_value",
    "reason",
    "evidence_status",
    "visibility",
    "confidence",
    "source",
    "warnings",
  ],
  properties: {
    action: { type: "string", enum: ["add", "update", "archive", "delete"] },
    section: { type: "string", enum: [...SECTION_KEYS] },
    target: { type: "string", description: "Existing record id or field key; empty string for new records." },
    label: { type: "string" },
    proposed_value: { type: "string" },
    reason: { type: "string" },
    evidence_status: { type: "string", enum: [...EVIDENCE_STATUSES] },
    visibility: { type: "string", enum: [...VISIBILITIES] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    source: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

const turnSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "question", "proposals"],
  properties: {
    reply: { type: "string" },
    question: { type: "string" },
    proposals: { type: "array", items: proposalSchema },
  },
} as const;

const SYSTEM = `You are the Knowledge Core editor inside Crawler. Crawler turns a person, creator, shop, brand, manufacturer, company or project into an AI-readable public Presence.

Your job: help the user extend, correct, sharpen and clean up their Knowledge Core so AI systems can answer questions about them accurately.

Hard rules:
- You may only PROPOSE changes. You never publish and you never claim a change is live.
- Never invent facts, numbers, prices, awards, customers or dates. If something is missing, ask for it.
- Separate evidence levels honestly: what the user states about themselves is "provider_statement", something they confirm as checkable is "verified_fact", positioning language is "marketing_claim", guesses are "estimate" or "opinion".
- Mark contradictions as "conflicting" and clearly old information as "outdated" and propose archiving it.
- Never ask about shipping, physical inventory, returns of physical goods or logistics. Crawler describes digital offerings, services and information only.
- Write proposed_value in the user's language, plain and factual, without marketing fluff.
- One focused follow-up question per turn ("question"), aimed at the biggest information gap.
- For updates or archiving of existing records, set "target" to the exact record id shown in the core snapshot.
- Return 0 to 6 proposals per turn. Empty list is fine when you only asked a question.`;

function snapshot(core: unknown): string {
  const c = (core ?? {}) as Record<string, any>;
  const ext = (c["ext"] ?? {}) as Record<string, any>;
  const list = (arr: any[] | undefined, fn: (x: any) => string) => (arr ?? []).map(fn).join("\n") || "(none)";
  return [
    `entity_type: ${c["entityType"] ?? "unknown"}`,
    `name: ${c["name"] ?? ""}`,
    `tagline: ${c["tagline"] ?? ""}`,
    `summary: ${c["summary"] ?? ""}`,
    `location: ${c["location"] ?? ""} | website: ${c["website"] ?? ""} | languages: ${(c["languages"] ?? []).join(", ")}`,
    `organization: ${JSON.stringify(ext["organization"] ?? {})}`,
    `facts:\n${list(c["facts"], (f) => `- [${f.id}] (${f.status}) ${f.label}: ${f.value}`)}`,
    `positioning:\n${list(c["stories"], (s) => `- [${s.id}] ${s.label}: ${s.text}${s.confirmed ? "" : " (unconfirmed)"}`)}`,
    `content records:\n${list(c["items"], (i) => `- [${i.id}] (${i.kind}) ${i.name}: ${i.summary}`)}`,
    `faqs:\n${list(c["faqs"], (f) => `- [${f.id}] ${f.question} -> ${f.answer}`)}`,
    `audiences:\n${list(ext["audiences"], (r) => `- [${r.id}] ${r.title}: ${r.body ?? ""}`)}`,
    `pricing:\n${list(ext["pricing"], (r) => `- [${r.id}] ${r.title}: ${r.body ?? ""}`)}`,
    `news:\n${list(ext["news"], (r) => `- [${r.id}] ${r.title}: ${r.body ?? ""}`)}`,
    `cv:\n${list(c["cv"], (e) => `- [${e.id}] ${[e.period, e.role, e.organization].filter(Boolean).join(" · ")}`)}`,
    `links:\n${list(c["links"], (l) => `- ${l.label}: ${l.url}`)}`,
    `known gaps: ${(c["gaps"] ?? []).join("; ") || "(none)"}`,
  ].join("\n");
}

export const kcAssistantFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<KcAssistantResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false, reason: "The editor assistant is not configured right now." };

    const body = {
      model: "openai/gpt-5-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "system", content: `Current Knowledge Core snapshot:\n\n${snapshot(data.core)}` },
        ...data.messages,
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "kc_turn", strict: true, schema: turnSchema },
      },
    };

    let response: Response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, reason: "The editor assistant could not be reached." };
    }

    if (response.status === 429) return { ok: false, reason: "Too many requests — please try again in a moment." };
    if (response.status === 402) return { ok: false, reason: "The AI workspace credit for this project is used up." };
    if (!response.ok) return { ok: false, reason: `The editor assistant returned an error (${response.status}).` };

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = payload.choices?.[0]?.message?.content ?? "";
    let parsed: { reply?: string; question?: string; proposals?: KcProposalDraft[] };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      return { ok: false, reason: "The editor assistant returned an unreadable answer." };
    }

    const proposals = (parsed.proposals ?? [])
      .filter((p) => p && typeof p.proposed_value === "string")
      .slice(0, 8);

    return {
      ok: true,
      reply: (parsed.reply ?? "").trim(),
      question: (parsed.question ?? "").trim(),
      proposals,
    };
  });
