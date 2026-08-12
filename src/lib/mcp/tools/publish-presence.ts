import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { presenceChecks, presenceScore, presenceSlug } from "../../knowledge";
import { getSession } from "../sessions";
import { siteUrl } from "../site";

export default defineTool({
  name: "publish_presence",
  title: "Publish Presence",
  description:
    "Use this when the user asks to publish or host their Presence. Publishing is the paid step. Crawler has no accounts, no login and no registration: if the user already paid for this draft on the Crawler website, this publishes it and returns the live URLs plus a one-time management secret. Otherwise it returns publish_requires_payment=true plus a handoff URL that carries the anonymous draft so nothing is retyped. Creating and previewing a Presence is always free.",
  inputSchema: {
    session_id: z.string().trim().min(6).max(128).describe("Opaque session id returned by start_interview."),
    plan: z.enum(["plus", "pro", "business"]).optional().describe("Optional plan the user already chose."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ session_id, plan }) => {
    const session = await getSession(session_id);
    if (!session) throw new ToolError("Unknown or expired session_id. Call start_interview to begin a new session.");

    const base = siteUrl();
    const { redeemableIntentForSession, latestIntentForSession, markIntentPublished } = await import(
      "../../intents.server"
    );
    const intent = await redeemableIntentForSession(session.id);

    if (intent) {
      const { publishDraft, recoveryCode } = await import("../presences");
      const { presence, manageSecret } = await publishDraft({
        core: session.core,
        plan: intent.plan || plan || "plus",
        mode: "live",
        sessionToken: session.id,
        intentRef: intent.intentRef,
        billing: {
          billingCustomerId: intent.billingCustomerId,
          billingSubscriptionId: intent.billingSubscriptionId,
          subscriptionStatus: intent.subscriptionStatus,
          currentPeriodEnd: intent.currentPeriodEnd,
        },
      });
      await markIntentPublished(intent.intentRef, presence.slug);
      const url = `${base}/p/${presence.slug}`;
      const code = recoveryCode(presence.slug, manageSecret);

      return {
        content: [
          {
            type: "text" as const,
            text: `Published. Your Presence is live at ${url} — AI systems can read ${url}/llms.txt and the JSON endpoints under ${url}/api/.\n\nRecovery code (shown once, save it now):\n${code}\n\nThis code is the only way to manage, take offline or cancel this Presence at ${base}/manage. Crawler stores only a hash of it and cannot recover it for you.`,
          },
        ],
        structuredContent: {
          published: true,
          publish_requires_payment: false,
          mode: "live",
          plan: presence.plan,
          slug: presence.slug,
          presence_url: url,
          files: presence.files.map((f) => `${url}/${f.path}`),
          published_at: presence.publishedAt,
          presence_score: presenceScore(session.core),
          recovery_code: code,
          recovery_code_note:
            "Capability-based ownership: this code is shown exactly once and is never stored in raw form. Losing it means the Presence cannot be managed or recovered. Show it to the user verbatim and tell them to save it.",
          manage_url: `${base}/manage`,
        },
      };
    }

    const latest = await latestIntentForSession(session.id);

    // Free Beta 0.0.1: while live payments are not enabled, publishing is free.
    const { betaFree, releaseVersion } = await import("../site");
    if (betaFree() && !latest?.presenceSlug) {
      const { publishDraft, recoveryCode } = await import("../presences");
      const { presence, manageSecret } = await publishDraft({
        core: session.core,
        plan: plan || "plus",
        mode: "demo",
        sessionToken: session.id,
      });
      const url = `${base}/p/${presence.slug}`;
      const code = recoveryCode(presence.slug, manageSecret);
      return {
        content: [
          {
            type: "text" as const,
            text: `Published free in Crawler Free Beta ${releaseVersion()} — no payment was taken and no subscription was created. Your Presence is live at ${url} (${url}/llms.txt and the JSON endpoints under ${url}/api/).\n\nRecovery code (shown once, save it now):\n${code}\n\nThis code is the only way to manage this Presence at ${base}/manage. When paid operation (version 0.0.2) starts, hosting becomes a paid plan.`,
          },
        ],
        structuredContent: {
          published: true,
          publish_requires_payment: false,
          free_beta: true,
          release_version: releaseVersion(),
          mode: "free_beta",
          plan: presence.plan,
          slug: presence.slug,
          presence_url: url,
          files: presence.files.map((f) => `${url}/${f.path}`),
          published_at: presence.publishedAt,
          presence_score: presenceScore(session.core),
          recovery_code: code,
          recovery_code_note:
            "Capability-based ownership: shown exactly once, never stored raw. Losing it means the Presence cannot be managed.",
          manage_url: `${base}/manage`,
          beta_note:
            "Free Beta 0.0.1: publishing is free until live payments are enabled. Crawler then switches automatically to the paid version 0.0.2.",
        },
      };
    }

    const url = `${base}/publish?session=${encodeURIComponent(session.id)}${plan ? `&plan=${plan}` : ""}`;
    const reason = latest?.presenceSlug
      ? "This draft has already been published. Manage it with the recovery code you received at publish time."
      : "Hosting is the paid step. Crawler has no accounts: choose a plan and pay on the Crawler website, then this draft goes online and you receive a one-time recovery code.";


    return {
      content: [
        {
          type: "text" as const,
          text: `Nothing new was published. ${reason} Your draft is saved, so this link picks it straight up: ${url}`,
        },
      ],
      structuredContent: {
        published: false,
        publish_requires_payment: true,
        payment_completed: false,
        already_published_slug: latest?.presenceSlug ?? null,
        reason,
        handoff_url: url,
        handoff_note:
          "The URL carries the anonymous draft token, so the website recovers this exact Knowledge Core. Anyone with the link can open the draft — share it only with the owner. No account is created at any point.",
        pricing_url: `${base}/pricing`,
        manage_url: `${base}/manage`,
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
