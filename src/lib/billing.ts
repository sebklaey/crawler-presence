export type PlanId = "plus" | "pro" | "business";

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  features: string[];
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
      "Small catalog (up to 10 products, projects or services)",
      "Basic analytics, 7-day window",
      "llms.txt, markdown pages and JSON endpoints",
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
      "Detailed conversation insights",
      "Improve my Presence recommendations",
      "Custom domain",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: 80,
    catalogLimit: 5000,
    analyticsDays: 3650,
    features: [
      "Team use with shared presences",
      "Large catalog (up to 5,000 entries)",
      "Unlimited analytics history",
      "API access and scheduled reports",
      "Priority support",
    ],
  },
];

export const planById = (id: PlanId) => PLANS.find((p) => p.id === id)!;

/**
 * Paddle price ids are deployment secrets (`PADDLE_PRICE_PLUS` and friends),
 * read server-side in `paddle.server.ts`. The browser never needs them.
 */
