import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { allowRequest } from "../presences";
import { runInterviewTurn, toKnowledgeCore } from "../../interview-core.server";
import { presenceScore } from "../../knowledge";
import { createSession, saveSession, SESSION_NOTE } from "../sessions";

export default defineTool({
  name: "start_interview",
  title: "Start Presence interview",
  description:
    "Use this when a user wants to create or start an AI-readable Crawler Presence. Accepts a free-text description and optionally a website URL. Infers the entity type, returns an opaque anonymous session_id (durable ~30 days, not tied to any account), a first Knowledge Core draft, detected facts, detected narrative/positioning and the single most valuable adaptive follow-up question.",
  inputSchema: {
    free_text: z
      .string()
      .trim()
      .min(3)
      .max(6000)
      .describe("What the person, creator, studio, company or project does, in their own words."),
    source_url: z
      .string()
      .url()
      .optional()
      .describe("Optional website or landing-page URL the user pasted. Used as context only."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ free_text, source_url }) => {
    if (!(await allowRequest("tool:start_interview", 60)))
      throw new ToolError("Crawler is rate limited right now (60 interview starts per minute). Try again shortly.");
    const session = createSession();
    const message = source_url ? `${free_text}\n\nSource URL: ${source_url}` : free_text;

    let turn;
    try {
      turn = await runInterviewTurn({ core: {}, transcript: `USER: ${message}` });
    } catch (e) {
      throw new ToolError(`Interview model unavailable: ${String((e as Error).message ?? e)}`);
    }

    session.core = toKnowledgeCore(turn.core);
    session.confidence = turn.confidence;
    session.transcript = [
      { role: "user", content: message },
      { role: "assistant", content: turn.question || turn.reply },
    ];
    await saveSession(session);

    // Measurable analytics: does this tool input reference a published Presence?
    try {
      const { recordMentionsFromInput } = await import("../presence-analytics");
      await recordMentionsFromInput(message, session.id);
    } catch {
      /* analytics must never break an interview */
    }

    const payload = {
      session_id: session.id,
      session_note: SESSION_NOTE,
      entity_type: session.core.entityType,
      confidence: turn.confidence,
      presence_score: presenceScore(session.core),
      knowledge_core_summary: {
        name: session.core.name,
        tagline: session.core.tagline,
        summary: session.core.summary,
        location: session.core.location ?? null,
        website: session.core.website ?? source_url ?? null,
      },
      verified_facts: session.core.facts.filter((f) => f.status === "verified").map((f) => ({ label: f.label, value: f.value })),
      claimed_facts: session.core.facts.filter((f) => f.status === "claimed").map((f) => ({ label: f.label, value: f.value })),
      narrative: session.core.stories.map((s) => ({ label: s.label, text: s.text, confirmed: s.confirmed })),
      missing_information: session.core.gaps,
      next_question: turn.question,
      example_answers: turn.suggestions,
    };

    return {
      content: [{ type: "text", text: `${turn.reply}\n\n${turn.question}\n\n(session_id: ${session.id})` }],
      structuredContent: payload,
    };
  },
});
