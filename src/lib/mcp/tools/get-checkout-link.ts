import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { planById } from "../../billing";
import { paymentsConfigured, releaseVersion, siteUrl } from "../site";
import { hasEntitlement, normalizePlan, planRankOf } from "../../entitlements/features";
import { PLAN_DEFINITIONS } from "../../entitlements/plans";

/**
 * The ONE explicit, mutating command that may create a payment transaction.
 * Every getter (get_my_plan, get_pricing, upgrade messages) is side-effect
 * free and links to the Crawler checkout page instead.
 */
export default defineTool({
  name: "get_checkout_link",
  title: "Create checkout link",
  description:
    "Use this only when the user explicitly wants to pay for hosting now. Creates (or reuses) one checkout for the chosen plan and returns the external Crawler checkout URL. Repeated calls with the same session reuse the same transaction. Never returns a link for a plan the user already has.",
  inputSchema: {
    plan: z.enum(["plus", "pro", "business"]).describe("Plan to purchase."),
    session_id: z
      .string()
      .trim()
      .min(6)
      .optional()
      .describe("Crawler draft session (sess_…) the checkout belongs to. Used as the idempotency key."),
    confirm_downgrade: z
      .boolean()
      .optional()
      .describe("Set true only when the user explicitly asked to move to a cheaper plan."),
  },
  // Creates a transaction — explicitly NOT read-only.
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  outputSchema: {
    state: z
      .string()
      .describe("upgrade | downgrade | already_subscribed | payment_pending | temporarily_unavailable"),
    plan: z.string(),
    plan_name: z.string(),
    price_usd_per_month: z.number(),
    current_plan: z.string(),
    checkout_url: z
      .string()
      .optional()
      .describe("External Crawler checkout URL — payment never happens in the conversation."),
    release_version: z.string(),
    payment_possible: z.boolean(),
    note: z.string(),
  },
  handler: async ({ plan, session_id, confirm_downgrade }) => {
    const target = planById(plan);
    const base = siteUrl();
    const live = paymentsConfigured();

    let currentPlan = "free";
    if (session_id) {
      try {
        const { resolveAccessContext } = await import("../../core/access.server");
        currentPlan = (await resolveAccessContext({ sessionId: session_id })).plan;
      } catch {
        currentPlan = "free";
      }
    }
    currentPlan = normalizePlan(currentPlan);

    const respond = (state: string, note: string, url?: string) => ({
      content: [{ type: "text" as const, text: url ? `${note}\n\n${url}` : note }],
      structuredContent: {
        state,
        plan: target.id,
        plan_name: target.name,
        price_usd_per_month: target.price,
        current_plan: currentPlan,
        ...(url ? { checkout_url: url } : {}),
        release_version: releaseVersion(),
        payment_possible: live,
        note,
      },
    });

    if (!live) {
      return respond(
        "temporarily_unavailable",
        `Checkout is temporarily unavailable on this deployment. Nothing was charged and no plan changed. Try again shortly at ${base}/pricing.`,
      );
    }

    if (currentPlan === plan) {
      return respond(
        "already_subscribed",
        `You are already on Crawler ${target.name} ($${target.price}/month). No new checkout was created. Manage the subscription at ${base}/manage.`,
      );
    }

    if (hasEntitlement(currentPlan, plan) && planRankOf(currentPlan) > planRankOf(plan)) {
      if (!confirm_downgrade) {
        return respond(
          "downgrade",
          `Crawler ${target.name} is cheaper than your current ${PLAN_DEFINITIONS[currentPlan as "plus"].name} plan. Downgrades are handled in the Crawler billing portal so nothing is charged twice: ${base}/manage`,
        );
      }
      return respond(
        "downgrade",
        `Open the Crawler billing portal to switch down to ${target.name}: ${base}/manage`,
        `${base}/manage`,
      );
    }

    let url = `${base}/publish?plan=${plan}`;
    try {
      const { checkoutUrlFor } = await import("../../entitlements/upgrade.server");
      url = await checkoutUrlFor(plan, null, {
        createTransaction: true,
        idempotencyKey: session_id ?? null,
        sessionToken: session_id ?? null,
      });
    } catch {
      /* keep the site checkout fallback */
    }

    return respond(
      "upgrade",
      `Crawler ${target.name} — $${target.price}/month. Checkout is completed on the Crawler website, not in this conversation. No account is created: after the payment is confirmed the Presence goes live and a one-time recovery code is issued.`,
      url,
    );
  },
});
