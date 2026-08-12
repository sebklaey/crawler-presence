export type PlanId = "plus" | "pro" | "business";

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  /** Shipped and enforced today. */
  features: string[];
  /** On the roadmap — never presented as working. */
  planned?: string[];
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
      "1 published presence",
      "Small catalog (up to 10 offerings, projects or services)",
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
      "Larger catalog (up to 200 entries)",
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
      "Large catalog (up to 5,000 entries)",
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
