/**
 * Table-driven entitlement check for all Crawler MCP tools.
 * Run with: bun scripts/check-entitlements.ts
 */
import assert from "node:assert/strict";

import {
  PLAN_INFO,
  PLAN_ORDER,
  TOOL_PLANS,
  meetsPlan,
  requiredPlanForTool,
  upgradeTargetForTool,
  type CustomerPlan,
} from "../src/lib/entitlements/catalog";

const CUSTOMER_PLANS: CustomerPlan[] = ["free", "plus", "pro", "business"];

const allowed = (plan: CustomerPlan, tool: string) => {
  const required = requiredPlanForTool(tool);
  return required !== "admin" && meetsPlan(plan, required);
};

const TABLE: Array<[CustomerPlan, string, boolean]> = [
  ["free", "enter_universal", true],
  ["free", "enter_topic", true],
  ["free", "send_universal_message", true],
  ["free", "get_analytics", true],
  ["free", "publish_presence", false],
  ["free", "find_match", false],
  ["plus", "publish_presence", true],
  ["plus", "manage_room", true],
  ["plus", "create_invitation", true],
  ["plus", "find_match", false],
  ["plus", "create_sponsored_campaign", false],
  ["pro", "find_match", true],
  ["pro", "improve_presence", true],
  ["pro", "create_sponsored_campaign", false],
  ["business", "create_sponsored_campaign", true],
  ["business", "get_campaign_analytics", true],
  ["business", "admin_review_campaign", false],
];

let failures = 0;
const check = (label: string, fn: () => void) => {
  try {
    fn();
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${label}: ${(error as Error).message}`);
  }
};

check("plan order", () => assert.deepEqual(PLAN_ORDER, ["free", "plus", "pro", "business"]));
check("prices", () => {
  assert.equal(PLAN_INFO.free.price, 0);
  assert.equal(PLAN_INFO.plus.price, 5);
  assert.equal(PLAN_INFO.pro.price, 20);
  assert.equal(PLAN_INFO.business.price, 80);
});
check("every tool maps to a known plan", () => {
  for (const [tool, plan] of Object.entries(TOOL_PLANS)) {
    assert.ok([...PLAN_ORDER, "admin"].includes(plan), `${tool} → ${plan}`);
  }
});
for (const plan of CUSTOMER_PLANS) {
  check(`${plan} cannot use admin tools`, () => assert.equal(allowed(plan, "admin_review_campaign"), false));
}
for (const [plan, tool, expected] of TABLE) {
  check(`${plan} → ${tool}`, () => assert.equal(allowed(plan, tool), expected));
}
check("cheapest upgrade target", () => {
  assert.equal(upgradeTargetForTool("find_match"), "pro");
  assert.equal(upgradeTargetForTool("manage_campaign"), "business");
});

console.log(`Tools mapped: ${Object.keys(TOOL_PLANS).length}`);
console.log(failures ? `${failures} check(s) failed` : "All entitlement checks passed");
if (failures) process.exit(1);
