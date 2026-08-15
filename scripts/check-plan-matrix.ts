/**
 * Central plan/feature matrix tests. Run with: bun scripts/check-plan-matrix.ts
 */
import assert from "node:assert/strict";
import {
  canUseFeature,
  hasEntitlement,
  highestPlan,
  normalizePlan,
  requiredPlanForFeature,
} from "../src/lib/entitlements/features";

let failures = 0;
const check = (label: string, fn: () => void) => {
  try {
    fn();
    console.log(`PASS ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${label}: ${(error as Error).message}`);
  }
};

check("free + own room -> blocked, Plus", () => {
  assert.equal(canUseFeature("free", "private_rooms"), false);
  assert.equal(requiredPlanForFeature("private_rooms"), "plus");
});
check("free + community -> blocked, Pro", () => {
  assert.equal(canUseFeature("free", "communities"), false);
  assert.equal(requiredPlanForFeature("communities"), "pro");
});
check("plus + own room -> allowed", () => assert.equal(canUseFeature("plus", "private_rooms"), true));
check("plus + community -> blocked", () => assert.equal(canUseFeature("plus", "communities"), false));
check("pro + own room -> allowed", () => assert.equal(canUseFeature("pro", "private_rooms"), true));
check("pro + community -> allowed", () => assert.equal(canUseFeature("pro", "communities"), true));
check("pro inherits every plus feature", () => {
  for (const key of ["personal_room", "invitations", "custom_alias", "favorites", "pin"]) {
    assert.equal(canUseFeature("pro", key), true, key);
  }
});
check("pro + love -> allowed", () => assert.equal(canUseFeature("pro", "love"), true));
check("pro + organizations -> business only", () => {
  assert.equal(canUseFeature("pro", "organizations"), false);
  assert.equal(requiredPlanForFeature("organizations"), "business");
});
check("business unlocks everything", () => {
  for (const key of ["private_rooms", "communities", "organizations", "campaigns", "api_access"]) {
    assert.equal(canUseFeature("business", key), true, key);
  }
});
check("sugar and free features need no plan", () => {
  for (const key of ["get_my_sugar", "universal_room", "topic_rooms", "public_profile"]) {
    assert.equal(canUseFeature("free", key), true, key);
  }
});
check("normalization", () => {
  assert.equal(normalizePlan("PRO"), "pro");
  assert.equal(normalizePlan(" Business "), "business");
  assert.equal(normalizePlan("crawler_plus"), "plus");
  assert.equal(normalizePlan(null), "free");
  assert.equal(normalizePlan("nonsense"), "free");
});
check("hierarchy", () => {
  assert.equal(hasEntitlement("pro", "plus"), true);
  assert.equal(hasEntitlement("business", "pro"), true);
  assert.equal(hasEntitlement("plus", "pro"), false);
});
check("highest plan wins, never a downgrade", () => {
  assert.equal(highestPlan("free", "pro"), "pro");
  assert.equal(highestPlan("pro", undefined), "pro");
  assert.equal(highestPlan("plus", "business", "free"), "business");
});

console.log(failures ? `${failures} check(s) failed` : "All plan matrix checks passed");
if (failures) process.exit(1);
