/**
 * One canonical entitlement field name: `required_plan`.
 *
 * These tests build real upgrade payloads through the server helper (not a
 * handcrafted object) for Free→Plus, Plus→Pro and Pro→Business and validate
 * them against the same runtime validator the MCP adapter uses.
 *
 * Run: bun test tests/entitlement-field.test.ts
 */
import { describe, expect, test } from "bun:test";

import { responseValidator } from "../src/lib/mcp/response";
import { buildUpgradePayload } from "../src/lib/entitlements/upgrade.server";

const validator = responseValidator({
  type: "object",
  properties: { room_id: { type: "string" } },
  required: ["room_id"],
});

const CASES = [
  { current: "free", required: "plus", tool: "set_alias" },
  { current: "plus", required: "pro", tool: "create_public_room" },
  { current: "pro", required: "business", tool: "create_sponsored_campaign" },
] as const;

describe("upgrade payloads use required_plan everywhere", () => {
  for (const testCase of CASES) {
    test(`${testCase.current} → ${testCase.required}`, async () => {
      const payload = await buildUpgradePayload({
        tool: testCase.tool,
        feature: testCase.tool,
        currentPlan: testCase.current,
        language: "en",
        requiredPlan: testCase.required,
      });

      expect(payload.required_plan).toBe(testCase.required);
      expect((payload as unknown as Record<string, unknown>)["plan_required"]).toBeUndefined();
      expect(payload.required_plan).not.toBeNull();
      expect(payload.current_plan).toBe(testCase.current);
      expect(typeof payload.upgrade_url).toBe("string");
      expect(payload.upgrade_url.length).toBeGreaterThan(0);

      // Exactly what the adapter emits for a denied call.
      const envelope = { status: "upgrade_required", retryable: false, ...payload };
      const parsed = validator.safeParse(envelope);
      expect(parsed.success).toBe(true);
    });
  }

  test("a limit_reached envelope keeps required_plan and usage", async () => {
    const payload = await buildUpgradePayload({
      tool: "create_public_room",
      feature: "Rooms",
      currentPlan: "plus",
      language: "en",
      requiredPlan: "pro",
      usage: { used: 3, max: 3, unit: "rooms" },
    });
    const envelope = { status: "limit_reached", retryable: false, ...payload };
    expect(payload.required_plan).toBe("pro");
    expect(validator.safeParse(envelope).success).toBe(true);
  });

  test("no MCP source file still uses the old plan_required spelling", async () => {
    const { Glob } = await import("bun");
    const offenders: string[] = [];
    for await (const file of new Glob("src/**/*.{ts,tsx}").scan(".")) {
      const text = await Bun.file(file).text();
      // `"plan_required"` as an error *code* value is unrelated to the field name.
      if (/(^|[^"'])\bplan_required\s*[:?]/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
