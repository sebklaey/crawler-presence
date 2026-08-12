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

/**
 * Paddle price ids are deployment secrets (`PADDLE_PRICE_PLUS` and friends),
 * read server-side in `paddle.server.ts`. The browser never needs them.
 */
