import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { presenceChecks, presenceScore, presenceSlug } from "../../knowledge";
import { getSession, getSessionOwner } from "../sessions";
import { siteUrl } from "../site";

export default defineTool({
  name: "publish_presence",
  title: "Publish Presence",
  description:
    "Use this when the user asks to publish or host their Presence. Publishing is the paid step and requires a Crawler account with an active subscription. If the draft has already been linked to a subscribed account, this publishes it and returns the live URLs. Otherwise it returns publish_requires_account=true plus a handoff URL that carries the anonymous draft so nothing is retyped. Creating and previewing a Presence is always free.",
  inputSchema: {
    session_id: z.string().trim().min(6).max(128).describe("Opaque session id returned by start_interview."),
    plan: z.enum(["plus", "pro", "business"]).optional().describe("Optional plan the user already chose."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ session_id, plan }) => {
    const session = await getSession(session_id);
    if (!session) throw new ToolError("Unknown or expired session_id. Call start_interview to begin a new session.");

    const base = siteUrl();
    const owner = await getSessionOwner(session_id);
    const { ownerPlan } = await import("../../subscription.server");
    const subscription = await ownerPlan(owner);

    if (owner && subscription.active) {
      const { publishDraft } = await import("../presences");
      const record = await publishDraft({
        core: session.core,
        plan: subscription.plan ?? plan ?? "plus",
        mode: "live",
        sessionToken: session.id,
        ownerUserId: owner,
      });
      const url = `${base}/p/${record.slug}`;
      return {
        content: [
          {
            type: "text" as const,
            text: `Published. Your Presence is live at ${url} — AI systems can read ${url}/llms.txt and the JSON endpoints under ${url}/api/.`,
          },
        ],
        structuredContent: {
          published: true,
          publish_requires_account: false,
          mode: "live",
          plan: subscription.plan,
          slug: record.slug,
          presence_url: url,
          files: record.files.map((f) => `${url}/${f.path}`),
          published_at: record.publishedAt,
          presence_score: presenceScore(session.core),
        },
      };
    }

    const url = `${base}/publish?session=${encodeURIComponent(session.id)}${plan ? `&plan=${plan}` : ""}`;
    const reason = owner
      ? "This draft is linked to a Crawler account, but that account has no active subscription. Hosting is the paid step."
      : "This MCP endpoint is unauthenticated and has no ChatGPT account identity. Sign in on the Crawler website to claim this draft and start a subscription.";

    return {
      content: [
        {
          type: "text" as const,
          text: `Nothing is published yet. ${reason} Your draft is saved, so this link picks it straight up: ${url}`,
        },
      ],
      structuredContent: {
        published: false,
        publish_requires_account: true,
        account_linked: Boolean(owner),
        subscription_active: false,
        reason,
        handoff_url: url,
        handoff_note:
          "The URL carries the anonymous draft token, so the website recovers this exact Knowledge Core. Anyone with the link can open the draft — share it only with the owner.",
        pricing_url: `${base}/pricing`,
        account_url: `${base}/account`,
        suggested_slug: presenceSlug(session.core),
        presence_score: presenceScore(session.core),
        remaining_checks: presenceChecks(session.core)
          .filter((c) => !c.done)
          .map((c) => c.label),
        free_forever: ["Adaptive interview", "Knowledge Core", "All file previews"],
      },
    };
  },
});
