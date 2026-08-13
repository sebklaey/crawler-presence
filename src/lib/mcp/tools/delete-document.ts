import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { toKnowledgeCore } from "../../interview-core.server";
import { normalizeCore, repairCore } from "../../interview-rules";
import { presenceScore } from "../../knowledge";
import { allowRequest } from "../presences";
import { getSession, saveSession } from "../sessions";
import { siteUrl } from "../site";

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default defineTool({
  name: "delete_document",
  title: "Delete an imported text document",
  description:
    "Removes a previously imported text document from the Crawler Knowledge Core of an anonymous draft session. Match by exact title (case-insensitive) or by the document slug used in docs/<slug>.md. The document disappears from the public files (docs/<slug>.md and api/documents.json) only after publish_presence is called again.",
  inputSchema: {
    session_id: z.string().trim().min(6).max(128).describe("Opaque session id returned by start_interview."),
    title: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .describe("Title of the document to delete, or its slug as used in docs/<slug>.md."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ session_id, title }) => {
    if (!(await allowRequest(`tool:delete_document:${session_id}`, 20)))
      throw new ToolError("Too many document deletions for this session in the last minute. Try again shortly.");

    const session = await getSession(session_id);
    if (!session)
      throw new ToolError(
        "Unknown or expired session_id. Anonymous drafts are stored for ~30 days; call start_interview again to begin a new one.",
      );

    const core = repairCore(normalizeCore(session.core));
    const documents = [...(core.documents ?? [])];
    const wanted = title.toLowerCase();
    const at = documents.findIndex(
      (d) => d.title.toLowerCase() === wanted || slugify(d.title) === slugify(title),
    );

    if (at < 0)
      throw new ToolError(
        documents.length
          ? `No document titled "${title}" in this draft. Available documents: ${documents.map((d) => d.title).join(", ")}.`
          : "This draft holds no documents.",
      );

    const [removed] = documents.splice(at, 1);
    const next = { ...core, documents };
    session.core = toKnowledgeCore(next);
    session.updatedAt = Date.now();
    await saveSession(session);

    const count = documents.length;
    const base = siteUrl();

    return {
      content: [
        {
          type: "text" as const,
          text: `Deleted "${removed?.title ?? title}" from the Knowledge Core. The draft now holds ${count} document${count === 1 ? "" : "s"}. The public files still contain it until you call publish_presence again.`,
        },
      ],
      structuredContent: {
        deleted: true,
        title: removed?.title ?? title,
        removed_public_path: `docs/${slugify(removed?.title ?? title)}.md`,
        document_count: count,
        remaining_documents: documents.map((d) => d.title),
        published: false,
        publish_prompt: "Do you want to publish and show the publish link?",
        publish_handoff_url: `${base}/publish?session=${encodeURIComponent(session.id)}`,
        presence_score: presenceScore(session.core),
      },
    };
  },
});
