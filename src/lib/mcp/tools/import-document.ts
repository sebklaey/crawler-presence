import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { PLANS } from "../../billing";
import { toKnowledgeCore } from "../../interview-core.server";
import { normalizeCore, repairCore } from "../../interview-rules";
import { presenceScore } from "../../knowledge";
import { allowRequest } from "../presences";
import { getSession, saveSession } from "../sessions";
import { siteUrl } from "../site";

/** Hard safety cap for a single imported document. */
const MAX_CHARS = 60_000;
/** Safety cap for anonymous drafts before a plan is chosen. */
const DRAFT_CAP = 200;

const planLimits = () =>
  Object.fromEntries(
    PLANS.map((p) => [p.id, Number.isFinite(p.documentLimit) ? p.documentLimit : "unlimited"]),
  );

export default defineTool({
  name: "import_document",
  title: "Import a text document",
  description:
    "Use this when the user uploads or pastes a text document (txt, md, csv, or the extracted text of a PDF/DOCX) in the chat and wants it in their Crawler Knowledge Core. YOU read the uploaded file and send its plain text here — Crawler stores no binaries and runs no model of its own. Each imported document becomes a public AI-readable page (docs/<slug>.md) plus an entry in api/documents.json once the Presence is published with publish_presence. Plan limits apply to how many documents stay public: Plus 3, Pro 50, Business unlimited.",
  inputSchema: {
    session_id: z.string().trim().min(6).max(128).describe("Opaque session id returned by start_interview."),
    title: z.string().trim().min(2).max(160).describe("Human-readable document title, e.g. the file name without extension."),
    text: z
      .string()
      .trim()
      .min(20)
      .max(MAX_CHARS)
      .describe("Plain text content of the uploaded document, verbatim. No binary data, no base64, no invented content."),
    source: z.string().trim().max(200).optional().describe("Original file name or origin, e.g. 'pricing-2026.pdf'."),
    replace: z.boolean().optional().describe("Replace an existing document with the same title (default true)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ session_id, title, text, source, replace }) => {
    if (!(await allowRequest(`tool:import_document:${session_id}`, 20)))
      throw new ToolError("Too many document imports for this session in the last minute. Try again shortly.");

    const session = await getSession(session_id);
    if (!session)
      throw new ToolError(
        "Unknown or expired session_id. Anonymous drafts are stored for ~30 days; call start_interview again to begin a new one.",
      );

    const core = repairCore(normalizeCore(session.core));
    const documents = [...(core.documents ?? [])];
    const at = documents.findIndex((d) => d.title.toLowerCase() === title.toLowerCase());
    const entry = {
      title,
      text,
      ...(source ? { source } : {}),
      addedAt: new Date().toISOString(),
    };

    if (at >= 0 && replace === false)
      throw new ToolError(`A document titled "${title}" already exists. Use a different title or set replace=true.`);
    if (at >= 0) documents[at] = entry;
    else {
      if (documents.length >= DRAFT_CAP)
        throw new ToolError(`This draft already holds ${DRAFT_CAP} documents, which is the maximum per draft.`);
      documents.push(entry);
    }

    const next = { ...core, documents };
    session.core = toKnowledgeCore(next);
    session.updatedAt = new Date().toISOString();
    await saveSession(session);

    const limits = planLimits();
    const count = documents.length;
    const base = siteUrl();

    return {
      content: [
        {
          type: "text" as const,
          text: `Imported "${title}" (${text.length} characters) into the Knowledge Core. The draft now holds ${count} document${count === 1 ? "" : "s"}. It is not public yet — call publish_presence to write docs/ pages and api/documents.json. How many documents stay public depends on the plan: Plus ${limits["plus"]}, Pro ${limits["pro"]}, Business ${limits["business"]}.`,
        },
      ],
      structuredContent: {
        imported: true,
        title,
        source: source ?? null,
        characters: text.length,
        document_count: count,
        public_path: `docs/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.md`,
        published: false,
        publish_prompt: "Do you want to publish and show the publish link?",
        publish_handoff_url: `${base}/publish?session=${encodeURIComponent(session.id)}`,
        plan_document_limits: limits,
        limit_note:
          "Documents beyond the plan limit stay stored in the Knowledge Core but are not rendered into the public files until the plan is upgraded.",
        presence_score: presenceScore(session.core),
        storage_note:
          "Crawler stores plain text only — never the original binary file. Do not send confidential material you do not want published.",
      },
    };
  },
});
