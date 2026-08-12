import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { generatedFiles, presenceScore } from "../../knowledge";
import { getSession, SESSION_NOTE } from "../sessions";

export default defineTool({
  name: "preview_presence",
  title: "Preview generated Presence files",
  description:
    "Use this when the user wants to see the AI-readable files Crawler would publish. Generates llms.txt, llms-full.txt, about.md and — only when relevant — offerings.md, projects.md, services.md, faq.md, cv.md, plus JSON payload previews for entity, offerings, projects and services. Contains only known facts; marketing/positioning copy is marked as narrative.",
  inputSchema: {
    session_id: z.string().trim().min(6).describe("Opaque session id returned by start_interview."),
    paths: z
      .array(z.string())
      .optional()
      .describe("Optional filter, e.g. ['llms.txt','about.md']. Omit to get every relevant file."),
    max_chars_per_file: z
      .number()
      .int()
      .min(200)
      .max(20000)
      .default(4000)
      .describe("Truncate each file preview to keep the response concise."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ session_id, paths, max_chars_per_file }) => {
    const session = await getSession(session_id);
    if (!session) throw new ToolError("Unknown or expired session_id. Call start_interview to begin a new session.");

    const limit = max_chars_per_file ?? 4000;
    const all = generatedFiles(session.core);
    const files = (paths?.length ? all.filter((f) => paths.includes(f.path)) : all).map((f) => ({
      path: f.path,
      type: f.type,
      truncated: f.content.length > limit,
      content: f.content.slice(0, limit),
    }));

    return {
      content: [
        {
          type: "text",
          text: `Generated ${files.length} file previews: ${files.map((f) => f.path).join(", ")}. Presence score ${presenceScore(session.core)}/100.`,
        },
      ],
      structuredContent: {
        session_id: session.id,
        session_note: SESSION_NOTE,
        presence_score: presenceScore(session.core),
        narrative_notice:
          "Entries under 'Positioning and story' and any fact with status 'claimed' are narrative/unconfirmed copy, not verified facts.",
        files,
      },
    };
  },
});
