import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { presenceChecks, presenceScore, presenceSlug } from "../../knowledge";
import { getSession } from "../sessions";
import { siteUrl, stripeConfigured } from "../site";

export default defineTool({
  name: "publish_presence",
  title: "Publish Presence (handoff to the website)",
  description:
    "Use this when the user asks to publish or host their Presence. Publishing is the paid step and always happens on the Crawler website, so this returns publish_requires_account=true plus a handoff URL that carries the anonymous draft session so nothing is retyped. Creating and previewing a Presence is free.",
  inputSchema: {
    session_id: z.string().trim().min(6).max(128).describe("Opaque session id returned by start_interview."),
    plan: z.enum(["plus", "pro", "business"]).optional().describe("Optional plan the user already chose."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ session_id, plan }) => {
    const session = await getSession(session_id);
    if (!session) throw new ToolError("Unknown or expired session_id. Call start_interview to begin a new session.");

    const base = siteUrl();
    const url = `${base}/publish?session=${encodeURIComponent(session.id)}${plan ? `&plan=${plan}` : ""}`;
    const live = stripeConfigured();

    return {
      content: [
        {
          type: "text",
          text: live
            ? `Nothing is published yet. Publishing is the paid step and finishes on the Crawler website — your draft is already saved, so this link picks it straight up: ${url}`
            : `Nothing is published yet. Stripe is not configured on this deployment, so the website runs the same flow in clearly labelled DEMO/TEST mode: no payment is taken and no real subscription is created. Your draft is saved and this link picks it up: ${url}`,
        },
      ],
      structuredContent: {
        published: false,
        publish_requires_account: true,
        checkout_mode: live ? "live" : "demo",
        payment_possible: live,
        reason:
          "Publishing is the paid step. This MCP server is unauthenticated and has no account identity, so plan choice, payment and claiming the Presence happen on the Crawler website.",
        handoff_url: url,
        handoff_note:
          "The URL carries the anonymous draft token, so the website recovers this exact Knowledge Core. Anyone with the link can open the draft — share it only with the owner.",
        pricing_url: `${base}/pricing`,
        suggested_slug: presenceSlug(session.core),
        presence_score: presenceScore(session.core),
        remaining_checks: presenceChecks(session.core).filter((c) => !c.done).map((c) => c.label),
        free_forever: ["Adaptive interview", "Knowledge Core", "All file previews"],
      },
    };
  },
});
