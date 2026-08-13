import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { planById } from "../../billing";
import { betaFree, paymentsConfigured, releaseVersion, siteUrl } from "../site";

export default defineTool({
  name: "get_checkout_link",
  title: "Get checkout link",
  description:
    "Use this when the user wants to pay for hosting and needs a checkout link. Returns the external Crawler checkout URL for the chosen plan. If no payment credentials are configured, returns a clearly labelled test/demo checkout state instead of a fake success.",
  inputSchema: {
    plan: z.enum(["plus", "pro", "business"]).describe("Plan to purchase."),
    session_id: z.string().trim().min(6).optional().describe("Optional Crawler session to attach to the checkout."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: ({ plan, session_id }) => {
    const p = planById(plan);
    const base = siteUrl();
    const url = `${base}/publish?plan=${plan}${session_id ? `&session=${encodeURIComponent(session_id)}` : ""}`;
    const live = paymentsConfigured();

    return {
      content: [
        {
          type: "text",
          text: live
            ? `${p.name} — $${p.price}/month. Complete checkout here: ${url}`
            : `${p.name} — $${p.price}/month. Crawler Alpha ${releaseVersion()} requires a paid subscription to publish, but checkout is temporarily unavailable on this deployment. Try again here shortly: ${url}`,
        },
      ],
      structuredContent: {
        plan: p.id,
        plan_name: p.name,
        price_usd_per_month: p.price,
        checkout_url: url,
        checkout_mode: live ? "live" : "unavailable",
        free_beta: betaFree(),
        release_version: releaseVersion(),
        payment_possible: live,
        note: live
          ? "Checkout is completed on the Crawler website, not inside this conversation. No Crawler account is created: after payment the Presence goes live and a one-time recovery code is issued."
          : "Crawler Alpha 0.0.2: publishing always requires a paid subscription. Checkout is temporarily unavailable on this deployment — nothing can be published for free.",
      },
    };
  },
});
