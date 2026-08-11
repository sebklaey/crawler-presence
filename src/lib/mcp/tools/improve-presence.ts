import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { allowRequest } from "../presences";
import { generateJson } from "../../ai-gateway.server";
import { presenceChecks, presenceScore } from "../../knowledge";
import { getSession } from "../sessions";

const schema = z.object({
  assessment: z.string(),
  fields_to_clarify: z
    .array(z.object({ field: z.string(), why: z.string() }))
    .default([]),
  next_question: z.string(),
  example_answers: z.array(z.string()).default([]),
});

export default defineTool({
  name: "improve_presence",
  title: "Improve the Presence",
  description:
    "Use this when the user has an analytics insight or a requested change and wants to know what to fix in their Presence. Identifies which Knowledge Core fields need clarification and returns one targeted next question. Never invents facts.",
  inputSchema: {
    session_id: z.string().trim().min(6).describe("Opaque session id returned by start_interview."),
    insight: z
      .string()
      .trim()
      .min(3)
      .max(2000)
      .describe("The analytics insight or requested change, e.g. 'people keep asking about frame sizes'."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ session_id, insight }) => {
    if (!(await allowRequest(`tool:improve_presence:${session_id}`, 20)))
      throw new ToolError("Too many improvement requests for this session in the last minute. Try again shortly.");
    const session = await getSession(session_id);
    if (!session) throw new ToolError("Unknown or expired session_id. Call start_interview to begin a new session.");

    let result;
    try {
      result = await generateJson({
        schema: schema as unknown as z.ZodType<z.infer<typeof schema>>,
        shape: `{"assessment":"2-3 sentences","fields_to_clarify":[{"field":"knowledge core field or file","why":""}],"next_question":"ONE targeted question","example_answers":["up to 3"]}`,
        system:
          "You review an AI-readable Presence Knowledge Core against a specific insight and say precisely which fields must be clarified so AI assistants can answer well. Be concrete and specific to the entity type. Never invent facts; name gaps instead.",
        prompt: `Insight or requested change: ${insight}\n\nKnowledge Core:\n${JSON.stringify(session.core, null, 2)}`,
      });
    } catch (e) {
      throw new ToolError(`Improvement model unavailable: ${String((e as Error).message ?? e)}`);
    }

    return {
      content: [{ type: "text", text: `${result.assessment}\n\n${result.next_question}` }],
      structuredContent: {
        session_id: session.id,
        presence_score: presenceScore(session.core),
        open_checks: presenceChecks(session.core).filter((c) => !c.done).map((c) => c.label),
        ...result,
        apply_hint: "Send the user's answer to continue_interview to merge it into the Knowledge Core.",
      },
    };
  },
});
