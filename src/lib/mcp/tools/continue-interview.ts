import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { allowRequest } from "../presences";
import { runInterviewTurn, toKnowledgeCore } from "../../interview-core.server";
import { presenceChecks, presenceScore } from "../../knowledge";
import { getSession, saveSession, SESSION_NOTE } from "../sessions";

export default defineTool({
  name: "continue_interview",
  title: "Continue Presence interview",
  description:
    "Use this after start_interview to submit the user's answer and get the next adaptive question. Merges the answer into the Knowledge Core, keeps verified facts separate from narrative claims, and returns either the next most valuable tailored question or interview_complete=true.",
  inputSchema: {
    session_id: z.string().trim().min(6).describe("Opaque session id returned by start_interview."),
    user_answer: z.string().trim().min(1).max(6000).describe("The user's answer to the previous question."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ session_id, user_answer }) => {
    if (!(await allowRequest(`tool:continue_interview:${session_id}`, 20)))
      throw new ToolError("Too many answers for this session in the last minute. Try again shortly.");
    const session = await getSession(session_id);
    if (!session) {
      throw new ToolError(
        "Unknown or expired session_id. Anonymous drafts are stored for ~30 days; call start_interview again to begin a new one.",
      );
    }

    const transcript = [...session.transcript, { role: "user" as const, content: user_answer }]
      .map((m) => `${m.role === "user" ? "USER" : "CRAWLER"}: ${m.content}`)
      .join("\n\n");

    let turn;
    try {
      turn = await runInterviewTurn({ core: session.core, transcript });
    } catch (e) {
      throw new ToolError(`Interview model unavailable: ${String((e as Error).message ?? e)}`);
    }

    session.core = toKnowledgeCore(turn.core);
    session.confidence = turn.confidence;
    session.complete = turn.interviewComplete;
    session.transcript = [
      ...session.transcript,
      { role: "user" as const, content: user_answer },
      { role: "assistant" as const, content: turn.question || turn.reply },
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
          text: turn.interviewComplete
            ? `${turn.reply}\n\nThe Knowledge Core is complete enough to preview. Use preview_presence next.`
            : `${turn.reply}\n\n${turn.question}`,
        },
      ],
      structuredContent: {
        session_id: session.id,
        session_note: SESSION_NOTE,
        entity_type: session.core.entityType,
        confidence: turn.confidence,
        interview_complete: turn.interviewComplete,
        presence_score: presenceScore(session.core),
        open_checks: presenceChecks(session.core).filter((c) => !c.done).map((c) => c.label),
        verified_facts: session.core.facts.filter((f) => f.status === "verified").map((f) => ({ label: f.label, value: f.value })),
        claimed_facts: session.core.facts.filter((f) => f.status === "claimed").map((f) => ({ label: f.label, value: f.value })),
        narrative: session.core.stories.map((s) => ({ label: s.label, text: s.text, confirmed: s.confirmed })),
        missing_information: session.core.gaps,
        next_question: turn.interviewComplete ? null : turn.question,
        example_answers: turn.suggestions,
      },
    };
  },
});
