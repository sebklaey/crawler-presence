import { describe, expect, it } from "vitest";

import {
  PLAN_ORDER,
  PLAN_INFO,
  TOOL_PLANS,
  meetsPlan,
  requiredPlanForTool,
  upgradeTargetForTool,
  type CustomerPlan,
} from "./catalog";

const CUSTOMER_PLANS: CustomerPlan[] = ["free", "plus", "pro", "business"];

/** Access rule under test: a customer plan may call a tool iff its rank is high enough. */
const allowed = (plan: CustomerPlan, tool: string) => {
  const required = requiredPlanForTool(tool);
  return required !== "admin" && meetsPlan(plan, required);
};

describe("entitlement catalogue", () => {
  it("covers all 78 Crawler tools", () => {
    expect(Object.keys(TOOL_PLANS)).toHaveLength(78);
  });

  it("orders plans free < plus < pro < business", () => {
    expect(PLAN_ORDER).toEqual(["free", "plus", "pro", "business"]);
  });

  it("keeps prices in one place only", () => {
    expect(PLAN_INFO.free.price).toBe(0);
    expect(PLAN_INFO.plus.price).toBe(5);
    expect(PLAN_INFO.pro.price).toBe(20);
    expect(PLAN_INFO.business.price).toBe(80);
    expect(PLAN_INFO.admin.price).toBeNull();
  });

  it.each(CUSTOMER_PLANS)("plan %s never unlocks admin tools", (plan) => {
    expect(allowed(plan, "admin_review_campaign")).toBe(false);
    expect(upgradeTargetForTool("admin_review_campaign")).toBeNull();
  });

  const TABLE: Array<[CustomerPlan, string, boolean]> = [
    ["free", "enter_universal", true],
    ["free", "enter_topic", true],
    ["free", "send_universal_message", true],
    ["free", "post_social_profile_to_room", true],
    ["free", "get_analytics", true],
    ["free", "publish_presence", false],
    ["free", "create_public_room", false],
    ["free", "find_match", false],
    ["plus", "publish_presence", true],
    ["plus", "manage_room", true],
    ["plus", "create_invitation", true],
    ["plus", "find_match", false],
    ["plus", "create_resonance_pattern", false],
    ["plus", "create_sponsored_campaign", false],
    ["pro", "find_match", true],
    ["pro", "open_pair_room", true],
    ["pro", "send_pair_message", true],
    ["pro", "improve_presence", true],
    ["pro", "create_sponsored_campaign", false],
    ["business", "create_sponsored_campaign", true],
    ["business", "submit_campaign_for_review", true],
    ["business", "get_campaign_analytics", true],
    ["business", "admin_review_campaign", false],
  ];

  it.each(TABLE)("%s → %s = %s", (plan, tool, expected) => {
    expect(allowed(plan, tool)).toBe(expected);
  });

  it("names the cheapest plan that unlocks each locked tool", () => {
    expect(upgradeTargetForTool("create_public_room")).toBe("plus");
    expect(upgradeTargetForTool("find_match")).toBe("pro");
    expect(upgradeTargetForTool("manage_campaign")).toBe("business");
  });

  it("every tool resolves to a known plan", () => {
    for (const [tool, plan] of Object.entries(TOOL_PLANS)) {
      expect([...PLAN_ORDER, "admin"], tool).toContain(plan);
    }
  });
});
