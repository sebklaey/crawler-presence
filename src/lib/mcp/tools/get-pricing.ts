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
        text: "Plus $5/mo — 1 presence, small catalog, 7-day analytics. Pro $20/mo — larger catalog, 90-day analytics, conversation insights, Improve my Presence, custom domain. Business $80/mo — team use, large catalog, unlimited analytics, API access and reports. Creating and previewing is free.",
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
      })),
      pricing_url: `${siteUrl()}/pricing`,
    },
  }),
});
