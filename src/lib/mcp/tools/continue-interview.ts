import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { allowRequest } from "../presences";
import { toKnowledgeCore } from "../../interview-core.server";
import {
  confidenceOf,
  INTERVIEWER_INSTRUCTIONS,
  interviewStep,
  isComplete,
  mergeCore,
  nextGap,
  normalizeCore,
  openGaps,
} from "../../interview-rules";
import { presenceChecks, presenceScore } from "../../knowledge";
import { getSession, saveSession, SESSION_NOTE } from "../sessions";

export default defineTool({
  name: "continue_interview",
  title: "Continue Presence interview",
  description:
    "Use this after start_interview to record the user's answer. Crawler runs NO language model of its own: you (the calling assistant) do the interviewing. Extract what the user said into core_update (facts, offerings, FAQ, links, summary) and send it here — Crawler merges it deterministically into the Knowledge Core, keeps verified facts separate from claims, and returns the next open gap so you can phrase the next domain-specific question yourself. Without core_update, Crawler falls back to a rule-based merge of the raw answer.",
  inputSchema: {
    session_id: z.string().trim().min(6).describe("Opaque session id returned by start_interview."),
    user_answer: z.string().trim().min(1).max(6000).describe("The user's answer to the previous question, verbatim."),
    core_update: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Structured Knowledge Core fragment you extracted from the answer: {entityType,name,tagline,summary,location,website,languages,facts:[{label,value,status:'verified'|'claimed',source}],stories,items:[{kind,name,summary}],faqs,cv,links}. Only include what the user actually stated — never invent values.",
      ),
    assistant_question: z
      .string()
      .trim()
      .max(500)
      .optional()
      .describe("The question you asked before this answer, for the stored transcript."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ session_id, user_answer, core_update, assistant_question }) => {
    if (!(await allowRequest(`tool:continue_interview:${session_id}`, 20)))
      throw new ToolError("Too many answers for this session in the last minute. Try again shortly.");
    const session = await getSession(session_id);
    if (!session) {
      throw new ToolError(
        "Unknown or expired session_id. Anonymous drafts are stored for ~30 days; call start_interview again to begin a new one.",
      );
    }

    // Either the assistant's structured extraction, or the deterministic fallback.
    const merged = core_update
      ? mergeCore(normalizeCore(session.core), core_update)
      : normalizeCore(interviewStep({ core: session.core, message: user_answer }).core);

    const gap = nextGap(merged);
    const complete = isComplete(merged);
    const confidence = confidenceOf(merged);

    session.core = toKnowledgeCore(merged as never);
    session.confidence = confidence;
    session.complete = complete;
    session.transcript = [
      ...session.transcript,
      ...(assistant_question ? [{ role: "assistant" as const, content: assistant_question }] : []),
      { role: "user" as const, content: user_answer },
    ].slice(-40);
    await saveSession(session);

    try {
      const { recordMentionsFromInput } = await import("../presence-analytics");
      await recordMentionsFromInput(user_answer, session.id);
    } catch {
      /* analytics must never break an interview */
    }

    return {
      content: [
        {
          type: "text",
          text: complete
            ? "Recorded. The Knowledge Core is complete enough to preview — use preview_presence next."
            : `Recorded. Biggest open gap: ${gap.label}. Ask the user one domain-specific question that closes it (suggested wording: ${gap.question}).`,
        },
      ],
      structuredContent: {
        session_id: session.id,
        session_note: SESSION_NOTE,
        no_own_model: true,
        interviewer_instructions: INTERVIEWER_INSTRUCTIONS,
        merge_mode: core_update ? "structured_update" : "rule_based_fallback",
        entity_type: session.core.entityType,
        confidence,
        interview_complete: complete,
        presence_score: presenceScore(session.core),
        open_checks: presenceChecks(session.core).filter((c) => !c.done).map((c) => c.label),
        open_gaps: openGaps(merged).map((g) => ({ key: g.key, label: g.label, suggested_question: g.question })),
        next_gap: complete ? null : { key: gap.key, label: gap.label, suggested_question: gap.question },
        verified_facts: session.core.facts.filter((f) => f.status === "verified").map((f) => ({ label: f.label, value: f.value })),
        claimed_facts: session.core.facts.filter((f) => f.status === "claimed").map((f) => ({ label: f.label, value: f.value })),
        narrative: session.core.stories.map((s) => ({ label: s.label, text: s.text, confirmed: s.confirmed })),
        missing_information: session.core.gaps,
        next_question: complete ? null : gap.question,
        example_answers: gap.suggestions,
      },
    };
  },
});
