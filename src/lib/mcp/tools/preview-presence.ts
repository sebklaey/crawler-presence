import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { generatedFiles } from "../../knowledge";
import { completenessScore } from "../../kc/model";
import { getSession, SESSION_NOTE } from "../sessions";
import { siteUrl } from "../site";

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
  outputSchema: {
    session_id: z.string().optional(),
    session_note: z.string().optional(),
    presence_score: z.number().optional(),
    narrative_notice: z.string().optional(),
    files: z
      .array(
        z.object({
          path: z.string().optional().describe("e.g. llms.txt, about.md, api/entity.json"),
          type: z.string().optional(),
          truncated: z.boolean().optional(),
          content: z.string().optional(),
        }),
      )
      .optional()
      .describe("Generated AI-readable file previews — nothing is published yet."),
    publish_handoff_url: z.string().optional(),
    publish_prompt: z.string().optional(),
  },
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

    const publishHandoffUrl = `${siteUrl()}/publish?session=${encodeURIComponent(session.id)}`;

    return {
      content: [
        {
          type: "text",
          text: `Generated ${files.length} file previews: ${files.map((f) => f.path).join(", ")}. Presence score ${completenessScore(session.core)}/100. To publish and get the live link, call publish_presence with this session_id or open ${publishHandoffUrl}.`,
        },
      ],
      structuredContent: {
        session_id: session.id,
        session_note: SESSION_NOTE,
        presence_score: completenessScore(session.core),
        narrative_notice:
          "Entries under 'Positioning and story' and any fact with status 'claimed' are narrative/unconfirmed copy, not verified facts.",
        files,
        publish_handoff_url: publishHandoffUrl,
        publish_prompt: "The previews are saved, but not yet published. Do you want to publish and show the publish link?",
      },
    };
  },
});
