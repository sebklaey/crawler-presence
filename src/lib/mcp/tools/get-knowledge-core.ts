import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { entityLabel } from "../../knowledge";
import { completeness, completenessScore } from "../../kc/model";
import { getSession, SESSION_NOTE } from "../sessions";

export default defineTool({
  name: "get_knowledge_core",
  title: "Get Knowledge Core",
  description:
    "Use this when you need the full structured Knowledge Core for a Crawler session: identity, verified facts, unconfirmed claims, narrative/positioning, digital content records, FAQ, CV, links and known gaps.",
  inputSchema: {
    session_id: z.string().trim().min(6).describe("Opaque session id returned by start_interview."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  outputSchema: {
    session_id: z.string().optional(),
    session_note: z.string().optional(),
    presence_score: z.number().optional().describe("Knowledge Core completeness, 0-100."),
    confidence: z.number().optional(),
    interview_complete: z.boolean().optional(),
    open_checks: z.array(z.string()).optional().describe("Remaining checks as 'label — hint'."),
    knowledge_core: z.any().optional().describe("Full structured Knowledge Core: identity, facts, claims, stories, items, faqs, cv, links, gaps."),
  },
  handler: async ({ session_id }) => {
    const session = await getSession(session_id);
    if (!session) throw new ToolError("Unknown or expired session_id. Call start_interview to begin a new session.");
    const c = session.core;
    return {
      content: [
        {
          type: "text",
          text: `${c.name || "Untitled presence"} — ${entityLabel[c.entityType]}. Presence score ${completenessScore(c)}/100, ${c.facts.filter((f) => f.status === "verified").length} verified facts.`,
        },
      ],
      structuredContent: {
        session_id: session.id,
        session_note: SESSION_NOTE,
        presence_score: completenessScore(c),
        confidence: session.confidence,
        interview_complete: session.complete,
        open_checks: completeness(c).filter((r) => !r.done).map((r) => `${r.label} — ${r.hint}`),
        knowledge_core: c,
      },
    };
  },
});
