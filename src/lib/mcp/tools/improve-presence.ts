import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { allowRequest } from "../presences";
import { INTERVIEWER_INSTRUCTIONS, normalizeCore, reviewCore } from "../../interview-rules";
import { completeness, completenessScore } from "../../kc/model";
import { getSession } from "../sessions";

export default defineTool({
  name: "improve_presence",
  title: "Improve the Presence",
  description:
    "Use this when the user has an analytics insight or a requested change and wants to know what to fix in their Presence. Crawler runs no language model of its own: it returns a deterministic gap analysis of the Knowledge Core plus the insight, and you phrase the targeted follow-up question. Never invents facts.",
  inputSchema: {
    session_id: z.string().trim().min(6).describe("Opaque session id returned by start_interview."),
    insight: z
      .string()
      .trim()
      .min(3)
      .max(2000)
      .describe("The analytics insight or requested change, e.g. 'people keep asking about licensing'."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ session_id, insight }) => {
    if (!(await allowRequest(`tool:improve_presence:${session_id}`, 20)))
      throw new ToolError("Too many improvement requests for this session in the last minute. Try again shortly.");
    const session = await getSession(session_id);
    if (!session) throw new ToolError("Unknown or expired session_id. Call start_interview to begin a new session.");

    // Improvement recommendations are a Pro capability.
    const { resolvePlanForSession } = await import("@/lib/entitlements/guard.server");
    const { meetsPlan } = await import("@/lib/entitlements/catalog");
    const plan = await resolvePlanForSession(session_id);
    if (!meetsPlan(plan, "pro")) {
      const { buildUpgradePayload, detectLanguage } = await import("@/lib/entitlements/upgrade.server");
      const payload = await buildUpgradePayload({
        tool: "improve_presence",
        feature: "Improvement recommendations",
        currentPlan: plan,
        language: detectLanguage(insight),
      });
      return {
        content: [
          { type: "text" as const, text: `${payload.message}\n\n${payload.cta_label}: ${payload.upgrade_url}` },
        ],
        structuredContent: payload as unknown as Record<string, unknown>,
      };
    }

    const review = reviewCore(normalizeCore(session.core), insight);


    return {
      content: [
        {
          type: "text",
          text: `${review.headline}\n\n${review.nextQuestion || "Nothing critical is missing — ask the user what they want to refine."}`,
        },
      ],
      structuredContent: {
        session_id: session.id,
        no_own_model: true,
        interviewer_instructions: INTERVIEWER_INSTRUCTIONS,
        presence_score: completenessScore(session.core),
        open_checks: completeness(session.core).filter((r) => !r.done).map((r) => `${r.label} — ${r.hint}`),
        assessment: review.headline,
        strengths: review.strengths,
        fields_to_clarify: review.suggestions.map((s) => ({ field: s.title, why: s.why })),
        next_question: review.nextQuestion,
        example_answers: review.exampleAnswers,
        apply_hint:
          "Extract the user's answer into core_update and send it to continue_interview so Crawler merges it deterministically.",
      },
    };
  },
});
