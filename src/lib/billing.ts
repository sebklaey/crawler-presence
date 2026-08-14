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
  /** Explicitly NOT part of this plan — shown so the upgrade path is honest. */
  notIncluded?: string[];
  /** One line naming the concrete reason to move up a tier. */
  upgradeNote?: string;
  /** On the roadmap — never presented as working. */
  planned?: string[];
  /** Maximum number of digital Knowledge Core records hosted by Crawler. */
  catalogLimit: number;
  /** Maximum number of imported text documents (Infinity = unlimited). */
  documentLimit: number;
  analyticsDays: number;
  /** Analysis feedback + improvement recommendations (Pro and above). */
  improvementLoop: boolean;
  /** Continuous daily monitoring, recurring updates and report emails (Business). */
  continuousUpdates: boolean;
};


export const PLANS: Plan[] = [

  {
    id: "plus",
    name: "Plus",
    subtitle: "Publish and stay online",
    audience: ["Individuals", "Portfolios", "Small projects"],
    benefits: [
      "1 published Presence",
      "Up to 10 content records",
      "AI-readable files and JSON endpoints",
      "Basic measurement, 7-day window",
      "Monthly source check",
    ],
    cta: "Publish with Plus",
    price: 5,
    catalogLimit: 10,
    documentLimit: 3,
    analyticsDays: 7,
    improvementLoop: false,
    continuousUpdates: false,
    features: [
      "1 hosted digital Presence",
      "Up to 10 AI-readable content records",
      "Basic measurement with a 7-day window (accesses, reads, outbound clicks)",
      "llms.txt, markdown pages and JSON endpoints",
      "Accountless management via recovery code",
      "Up to 3 imported text documents",
      "Monthly check of your watched sources",
    ],
    notIncluded: [
      "Improvement recommendations from analysis feedback",
      "Detailed insights (recurring questions, information gaps)",
      "90-day analytics window",
      "Custom domain",
    ],
    upgradeNote:
      "Want Crawler to analyse your measured data and tell you what to improve, plus room for far more content? That is Pro.",
  },
  {
    id: "pro",
    name: "Pro",
    subtitle: "Analyse, learn and improve",
    audience: ["Freelancers", "Companies", "Shops", "Agencies"],
    benefits: [
      "Everything in Plus",
      "Improvement recommendations from your data",
      "Detailed insights, 90-day window",
      "Up to 200 content records",
      "Custom domain",
    ],
    cta: "Choose Pro",
    recommended: true,
    price: 20,
    catalogLimit: 200,
    documentLimit: 50,
    analyticsDays: 90,
    improvementLoop: true,
    continuousUpdates: false,
    features: [
      "Everything in Plus",
      "Improvement loop: analysis feedback turned into concrete recommendations",
      "Detailed insights (recurring questions, information gaps, top content)",
      "Analytics with a 90-day window",
      "Up to 200 AI-readable content records",
      "Up to 50 imported text documents",
      "Weekly check of your watched sources",
      "Custom domain with DNS verification",
    ],
    notIncluded: [
      "Daily source monitoring and continuous update cycle",
      "Scheduled report emails",
      "Shared team access and REST API",
      "Large knowledge bases above 200 records",
    ],
    upgradeNote:
      "Need extensive data volumes plus continuous daily monitoring and recurring updates? That is Business.",
  },
  {
    id: "business",
    name: "Business",
    subtitle: "Extensive data, continuously kept current",
    audience: ["Teams", "Organisations", "Platforms"],
    benefits: [
      "Everything in Pro",
      "Up to 5,000 content records",
      "Daily monitoring and continuous updates",
      "Scheduled report emails",
      "Team access and REST API",
    ],
    cta: "Choose Business",
    price: 80,
    catalogLimit: 5000,
    documentLimit: Number.POSITIVE_INFINITY,
    analyticsDays: 90,
    improvementLoop: true,
    continuousUpdates: true,
    features: [
      "Everything in Pro",
      "Up to 5,000 AI-readable content records",
      "Unlimited imported text documents",
      "Daily check of your watched sources — changes surface the next day",
      "Continuous improvement cycle with recurring recommendations",
      "Scheduled report emails on measurement and open improvements",
      "Analytics with a 90-day window over the full event retention",
      "REST API for Presence and analytics data",
      "Shared team access",
      "Priority support by email",
    ],
  },

];


export const planById = (id: PlanId) => PLANS.find((p) => p.id === id)!;

/** Analysis feedback and improvement recommendations start with Pro. */
export const hasImprovementLoop = (id: PlanId) => planById(id).improvementLoop;

/** Daily monitoring, recurring updates and report emails are Business. */
export const hasContinuousUpdates = (id: PlanId) => planById(id).continuousUpdates;



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
