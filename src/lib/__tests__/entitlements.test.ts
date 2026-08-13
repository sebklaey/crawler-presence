import { describe, expect, it } from "bun:test";

import { PLANS, planById, recommendPlan } from "../billing";
import {
  applyCatalogLimit,
  asPlanId,
  isPlanId,
  isRestricted,
  planFromPriceExternalId,
  PRICE_EXTERNAL_IDS,
} from "../entitlements";
import { completeCore, item } from "./fixtures";

describe("plan registry", () => {
  it("exposes plus, pro and business with rising limits and prices", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["plus", "pro", "business"]);
    expect(PLANS.map((p) => p.price)).toEqual([5, 20, 80]);
    expect(PLANS.map((p) => p.catalogLimit)).toEqual([10, 200, 5000]);
    expect(PLANS.filter((p) => p.recommended).map((p) => p.id)).toEqual(["pro"]);
  });

  it("resolves a plan by id", () => {
    expect(planById("pro").name).toBe("Pro");
    expect(planById("business").analyticsDays).toBe(90);
  });

  it("has a price id for every plan", () => {
    expect(Object.keys(PRICE_EXTERNAL_IDS).sort()).toEqual(PLANS.map((p) => p.id).sort());
  });
});

describe("isPlanId / asPlanId", () => {
  it("accepts only known plan ids", () => {
    expect(isPlanId("plus")).toBe(true);
    expect(isPlanId("free")).toBe(false);
    expect(isPlanId(null)).toBe(false);
    expect(isPlanId(5)).toBe(false);
  });

  it("falls back to plus for anything unknown", () => {
    expect(asPlanId("business")).toBe("business");
    expect(asPlanId("enterprise")).toBe("plus");
    expect(asPlanId(undefined)).toBe("plus");
  });
});

describe("planFromPriceExternalId", () => {
  it("maps every registered price back to its plan", () => {
    for (const plan of PLANS)
      expect(planFromPriceExternalId(PRICE_EXTERNAL_IDS[plan.id])).toBe(plan.id);
  });

  it("returns null for an unknown or missing price", () => {
    expect(planFromPriceExternalId("pri_other")).toBeNull();
    expect(planFromPriceExternalId(null)).toBeNull();
    expect(planFromPriceExternalId(undefined)).toBeNull();
    expect(planFromPriceExternalId("")).toBeNull();
  });
});

describe("isRestricted", () => {
  it("restricts unhealthy billing states", () => {
    for (const status of ["canceled", "past_due", "paused", "unpaid"])
      expect(isRestricted(status)).toBe(true);
  });

  it("leaves healthy, unknown and demo presences unrestricted", () => {
    expect(isRestricted("active")).toBe(false);
    expect(isRestricted("trialing")).toBe(false);
    expect(isRestricted(null)).toBe(false);
    expect(isRestricted(undefined)).toBe(false);
    expect(isRestricted("past_due", "demo")).toBe(false);
  });
});

describe("applyCatalogLimit", () => {
  const items = (count: number) =>
    Array.from({ length: count }, (_, i) => item("offering", `Item ${i + 1}`));

  it("keeps a core that fits the plan limit untouched", () => {
    const core = completeCore({ items: items(10) });
    const result = applyCatalogLimit(core, "plus");
    expect(result.core).toBe(core);
    expect(result).toMatchObject({ hidden: 0, limit: 10 });
  });

  it("hides the records above the limit without dropping them from the input", () => {
    const core = completeCore({ items: items(12) });
    const result = applyCatalogLimit(core, "plus");
    expect(result.core.items).toHaveLength(10);
    expect(result.core.items.at(-1)?.name).toBe("Item 10");
    expect(result.hidden).toBe(2);
    expect(core.items).toHaveLength(12);
  });

  it("uses the plan's own limit and falls back to plus for an unknown plan", () => {
    const core = completeCore({ items: items(12) });
    expect(applyCatalogLimit(core, "pro")).toMatchObject({ hidden: 0, limit: 200 });
    expect(applyCatalogLimit(core, "business")).toMatchObject({ hidden: 0, limit: 5000 });
    expect(applyCatalogLimit(core, "free")).toMatchObject({ hidden: 2, limit: 10 });
  });
});

describe("recommendPlan", () => {
  it("recommends plus for a small core with two reasons", () => {
    const result = recommendPlan({ itemCount: 3, hasWebsite: false });
    expect(result.plan).toBe("plus");
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons[0]).toContain("3 records");
  });

  it("uses the singular for a single record", () => {
    expect(recommendPlan({ itemCount: 1, hasWebsite: false }).reasons[0]).toContain("1 record —");
  });

  it("recommends pro above the plus limit or when a website exists", () => {
    expect(recommendPlan({ itemCount: 11, hasWebsite: false }).plan).toBe("pro");
    const withSite = recommendPlan({ itemCount: 2, hasWebsite: true });
    expect(withSite.plan).toBe("pro");
    expect(withSite.reasons[0]).toContain("custom domain");
  });

  it("recommends business above the pro limit or for team/API needs", () => {
    const large = recommendPlan({ itemCount: 201, hasWebsite: true });
    expect(large.plan).toBe("business");
    expect(large.reasons[0]).toContain("201 records");
    const teamNeed = recommendPlan({ itemCount: 1, hasWebsite: false, teamOrApi: true });
    expect(teamNeed.plan).toBe("business");
    expect(teamNeed.reasons[0]).toContain("team access");
  });

  it("keeps the plan boundaries inclusive of the included limits", () => {
    expect(recommendPlan({ itemCount: 10, hasWebsite: false }).plan).toBe("plus");
    expect(recommendPlan({ itemCount: 200, hasWebsite: false }).plan).toBe("pro");
  });
});
