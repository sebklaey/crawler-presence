import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { presenceChecks, presenceScore, presenceSlug } from "../../knowledge";
import { getSession } from "../sessions";
import { siteUrl } from "../site";

export default defineTool({
  name: "publish_presence",
  title: "Publish Presence (requires account)",
  description:
    "Use this when the user asks to publish or host their Presence. In this no-auth MVP nothing is published: it returns publish_requires_account=true plus an account-link / checkout URL to the Crawler website. Creating and previewing a Presence is free; hosting is paid.",
  inputSchema: {
    session_id: z.string().trim().min(6).describe("Opaque session id returned by start_interview."),
    plan: z.enum(["plus", "pro", "business"]).optional().describe("Optional plan the user already chose."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: ({ session_id, plan }) => {
    const session = getSession(session_id);
    if (!session) throw new ToolError("Unknown or expired session_id. Call start_interview to begin a new session.");

    const base = siteUrl();
    const url = `${base}/publish?session=${encodeURIComponent(session.id)}${plan ? `&plan=${plan}` : ""}`;

    return {
      content: [
        {
          type: "text",
          text: `Nothing was published. Publishing needs a linked Crawler account and a paid plan. Creating and previewing is free — continue here: ${url}`,
        },
      ],
      structuredContent: {
        published: false,
        publish_requires_account: true,
        reason:
          "This MCP server runs in no-auth MVP mode. It has no account identity and does not store user data durably, so it cannot publish private user data.",
        account_link_url: url,
        pricing_url: `${base}/pricing`,
        suggested_slug: presenceSlug(session.core),
        presence_score: presenceScore(session.core),
        remaining_checks: presenceChecks(session.core).filter((c) => !c.done).map((c) => c.label),
        free_forever: ["Adaptive interview", "Knowledge Core", "All file previews"],
      },
    };
  },
});
