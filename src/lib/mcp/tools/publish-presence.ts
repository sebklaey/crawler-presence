import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { presenceChecks, presenceSlug } from "../../knowledge";
import { completeness, completenessScore } from "../../kc/model";
import { getSession } from "../sessions";
import { siteUrl } from "../site";

export default defineTool({
  name: "publish_presence",
  title: "Publish Presence",
  description:
    "Publishes a Presence — and republishes it after every later change. If this draft is already live, calling this again rewrites the public files (llms.txt, llms-full.txt, about.md, offerings.md, faq.md, api/*.json) from the current Knowledge Core, with no new payment and the same recovery code. Otherwise publishing is the paid step: Crawler has no accounts, no login and no registration; if the user already paid for this draft on the Crawler website it goes live and returns a one-time management secret, otherwise it returns publish_requires_payment=true plus a handoff URL carrying the anonymous draft. Creating and previewing a Presence is always free.",
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

    // Already published from this draft? Then this call is an update: push the
    // current Knowledge Core to the live files instead of asking to pay again.
    const { getPublished, getPublishedBySessionToken, republishCore } = await import("../presences");
    const previousIntent = await latestIntentForSession(session.id);
    const existing =
      (await getPublishedBySessionToken(session.id)) ??
      (previousIntent?.presenceSlug ? await getPublished(previousIntent.presenceSlug) : undefined);

    if (existing) {
      const { isCoreEmpty } = await import("../../knowledge");
      if (isCoreEmpty(session.core)) {
        throw new ToolError(
          "This draft is empty, so nothing was written to the live Presence. Add content with continue_interview first.",
        );
      }
      const updated = await republishCore(existing.slug, session.core);
      const url = `${base}/p/${updated.slug}`;
      return {
        content: [
          {
            type: "text" as const,
            text: `Updated. The live Presence at ${url} now serves the current Knowledge Core (version ${updated.version}). Files rewritten: ${updated.files
              .map((f) => `/${f.path}`)
              .join(", ")}. No new payment was needed and the existing recovery code stays valid.`,
          },
        ],
        structuredContent: {
          published: true,
          updated: true,
          publish_requires_payment: false,
          mode: updated.mode,
          status: updated.status,
          plan: updated.plan,
          slug: updated.slug,
          version: updated.version,
          presence_url: url,
          files: updated.files.map((f) => `${url}/${f.path}`),
          updated_at: updated.updatedAt,
          presence_score: completenessScore(session.core),
          recovery_code: null,
          recovery_code_note:
            "The recovery code issued at first publication still applies; Crawler never re-issues it on updates.",
          manage_url: `${base}/manage`,
        },
      };
    }

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
          presence_score: completenessScore(session.core),
          recovery_code: code,
          recovery_code_note:
            "Capability-based ownership: this code is shown exactly once and is never stored in raw form. Losing it means the Presence cannot be managed or recovered. Show it to the user verbatim and tell them to save it.",
          manage_url: `${base}/manage`,
        },
      };
    }

    const latest = previousIntent;

    // Crawler Alpha 0.0.2: the free beta has ended — publishing is always paid.


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
        presence_score: completenessScore(session.core),
        remaining_checks: presenceChecks(session.core)
          .filter((c) => !c.done)
          .map((c) => c.label),
        free_forever: ["Adaptive interview", "Knowledge Core", "All file previews"],
      },
    };
  },
});
