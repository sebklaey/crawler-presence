import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { entityLabel, presenceChecks, presenceScore } from "../../knowledge";
import { getSession, SESSION_NOTE } from "../sessions";

export default defineTool({
  name: "get_knowledge_core",
  title: "Get Knowledge Core",
  description:
    "Use this when you need the full structured Knowledge Core for a Crawler session: identity, verified facts, unconfirmed claims, narrative/positioning, catalog, FAQ, CV, links and known gaps.",
  inputSchema: {
    session_id: z.string().trim().min(6).describe("Opaque session id returned by start_interview."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: ({ session_id }) => {
    const session = getSession(session_id);
    if (!session) throw new ToolError("Unknown or expired session_id. Call start_interview to begin a new session.");
    const c = session.core;
    return {
      content: [
        {
          type: "text",
          text: `${c.name || "Untitled presence"} — ${entityLabel[c.entityType]}. Presence score ${presenceScore(c)}/100, ${c.facts.filter((f) => f.status === "verified").length} verified facts.`,
        },
      ],
      structuredContent: {
        session_id: session.id,
        session_note: SESSION_NOTE,
        presence_score: presenceScore(c),
        confidence: session.confidence,
        interview_complete: session.complete,
        open_checks: presenceChecks(c).filter((x) => !x.done).map((x) => x.label),
        knowledge_core: c,
      },
    };
  },
});
