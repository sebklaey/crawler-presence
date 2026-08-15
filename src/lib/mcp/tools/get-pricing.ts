import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { PLANS } from "../../billing";
import { siteUrl } from "../site";

export default defineTool({
  name: "get_pricing",
  title: "Get Crawler pricing",
  description:
    "Use this when the user asks what Crawler costs or which plan they need. Returns the Plus / Pro / Business plans in USD per month with their concise feature differences. Creating and previewing a Presence is always free; hosting and analytics are paid.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  outputSchema: {
    currency: z.string().optional(),
    interval: z.string().optional(),
    free_tier: z.string().optional(),
    plans: z
      .array(
        z.object({
          id: z.string().optional().describe("plus, pro or business."),
          name: z.string().optional(),
          price_usd_per_month: z.number().optional(),
          catalog_limit: z.number().optional(),
          analytics_window_days: z.number().optional(),
          features: z.array(z.string()).optional(),
          planned_not_available_yet: z.array(z.string()).optional(),
        }),
      )
      .optional(),
    pricing_url: z.string().optional(),
  },
  handler: () => ({
    content: [
      {
        type: "text",
        text: "Crawler sells digital SaaS subscriptions for online AI-readable Presence hosting; no physical goods are sold or shipped. Plus $5/mo — 1 hosted Presence, up to 10 AI-readable content records and 7-day measured analytics. Pro $20/mo — up to 200 content records, 90-day analytics, detailed conversation insights, recommendations and a custom domain. Business $80/mo — up to 5,000 content records, 90-day analytics, REST API, shared team access, scheduled reports and priority support. Creating and previewing is free.",
      },
    ],
    structuredContent: {
      currency: "USD",
      interval: "month",
      free_tier: "Interview, Knowledge Core and all file previews are free. Hosting/publishing is paid.",
      plans: PLANS.map((p) => ({
        id: p.id,
        name: p.name,
        price_usd_per_month: p.price,
        catalog_limit: p.catalogLimit,
        analytics_window_days: p.analyticsDays,
        features: p.features,
        planned_not_available_yet: p.planned ?? [],
      })),
      pricing_url: `${siteUrl()}/pricing`,
    },
  }),

});
