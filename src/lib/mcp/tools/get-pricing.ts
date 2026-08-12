import { defineTool } from "@lovable.dev/mcp-js";
import { PLANS } from "../../billing";
import { siteUrl } from "../site";

export default defineTool({
  name: "get_pricing",
  title: "Get Crawler pricing",
  description:
    "Use this when the user asks what Crawler costs or which plan they need. Returns the Plus / Pro / Business plans in USD per month with their concise feature differences. Creating and previewing a Presence is always free; hosting and analytics are paid.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [
      {
        type: "text",
        text: "Plus $5/mo — 1 presence, up to 10 catalog entries, 7-day measured analytics. Pro $20/mo — up to 200 entries, 90-day analytics, detailed conversation insights and Improve my Presence. Business $80/mo — up to 5,000 entries, 90-day analytics and priority support. Creating and previewing is free. Custom domain, shared team access and API/scheduled reports are planned, not available yet.",
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
