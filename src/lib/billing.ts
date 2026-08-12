export type PlanId = "plus" | "pro" | "business";

export type Plan = {
  id: PlanId;
  name: string;
  /** Who this plan is for, in one line. */
  subtitle: string;
  /** Concrete audiences, shown as chips. */
  audience: string[];
  /** Benefit-first bullets shown in the plan cards. */
  benefits: string[];
  /** Explicit CTA label, never a bare "Continue". */
  cta: string;
  recommended?: boolean;
  price: number;
  /** Shipped and enforced today. */
  features: string[];
  /** On the roadmap — never presented as working. */
  planned?: string[];
  /** Maximum number of digital Knowledge Core records hosted by Crawler. */
  catalogLimit: number;
  analyticsDays: number;
};

export const PLANS: Plan[] = [

  {
    id: "plus",
    name: "Plus",
    subtitle: "For your first AI Presence",
    audience: ["Individuals", "Portfolios", "Small projects"],
    benefits: [
      "1 published Presence",
      "Up to 10 content records",
      "AI-readable files",
      "Public JSON endpoints",
      "Basic management",
    ],
    cta: "Publish with Plus",
    price: 5,
    catalogLimit: 10,
    analyticsDays: 7,
    features: [
      "1 hosted digital Presence",
      "Up to 10 AI-readable content records",
      "Measured analytics, 7-day window",
      "llms.txt, markdown pages and JSON endpoints",
      "Accountless management via recovery code",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    subtitle: "For professional and growing Presences",
    audience: ["Freelancers", "Companies", "Shops", "Agencies"],
    benefits: [
      "Up to 200 content records",
      "Your own domain",
      "Analytics and insights",
      "Room for richer content",
      "Professional management",
    ],
    cta: "Choose Pro",
    recommended: true,
    price: 20,
    catalogLimit: 200,
    analyticsDays: 90,
    features: [
      "Up to 200 AI-readable content records",
      "Analytics with a 90-day window",
      "Detailed conversation insights (recurring questions, gaps)",
      "Improve my Presence recommendations",
      "Custom domain with DNS verification",
    ],
  },
  {
    id: "business",
    name: "Business",
    subtitle: "For teams and large knowledge bases",
    audience: ["Teams", "Organisations", "Platforms"],
    benefits: [
      "Up to 5,000 content records",
      "Team features",
      "API access",
      "Scalable management",
      "Extended usage",
    ],
    cta: "Choose Business",
    price: 80,
    catalogLimit: 5000,
    analyticsDays: 90,
    features: [
      "Up to 5,000 AI-readable content records",
      "Analytics with a 90-day window over the full event retention",
      "Detailed conversation insights and improvement recommendations",
      "Custom domain with DNS verification",
      "REST API for Presence and analytics data",
      "Priority support by email",
      "Shared team access",
      "Scheduled report emails",
    ],
  },
];


export const planById = (id: PlanId) => PLANS.find((p) => p.id === id)!;

/** Benefits every paid plan includes — shown before the plan choice. */
export const HOSTING_BENEFITS = [
  "A permanently reachable public Presence",
  "Public AI-readable files (llms.txt, markdown)",
  "Structured JSON endpoints",
  "One place to update all content",
  "Plan-dependent analytics and insights",
  "Optionally your own domain",
  "A management code for later administration",
];

/**
 * Crawler publishes structured information. Whether external AI systems fetch
 * or use it is their decision — never promise indexing or recommendations.
 */
export const NO_GUARANTEE_NOTICE =
  "Crawler provides structured information. Whether external AI systems fetch or use it is decided by each provider.";

export type PlanRecommendation = { plan: PlanId; reasons: string[] };

/**
 * Recommends a plan from the Knowledge Core without ever restricting choice.
 * Two concrete reasons at most, derived only from what the user actually built.
 */
export function recommendPlan(input: {
  itemCount: number;
  hasWebsite: boolean;
  teamOrApi?: boolean;
}): PlanRecommendation {
  const { itemCount, hasWebsite, teamOrApi } = input;
  if (teamOrApi || itemCount > 200) {
    return {
      plan: "business",
      reasons: [
        itemCount > 200 ? `Your Knowledge Core holds ${itemCount} records — above the Pro limit of 200.` : "You need team access or the REST API.",
        "Business adds team features and API access.",
      ],
    };
  }
  if (itemCount > 10 || hasWebsite) {
    return {
      plan: "pro",
      reasons: [
        itemCount > 10
          ? `Your Knowledge Core holds ${itemCount} records — more than the 10 included in Plus.`
          : "You have your own website, so a custom domain keeps the Presence on your brand.",
        "Pro includes analytics with a 90-day window and insights.",
      ],
    };
  }
  return {
    plan: "plus",
    reasons: [
      `Your Knowledge Core holds ${itemCount} record${itemCount === 1 ? "" : "s"} — well inside the 10 included in Plus.`,
      "Plus covers a single published Presence with all AI-readable files.",
    ],
  };
}

/**
 * Paddle price ids are deployment secrets (`PADDLE_PRICE_PLUS` and friends),
 * read server-side in `paddle.server.ts`. The browser never needs them.
 */

 */
