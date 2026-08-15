/**
 * MCP contract tests.
 *
 * 1. The JSON-Schema → zod converter must preserve enums, patterns, formats,
 *    numeric ranges, array item schemas, length limits and additionalProperties.
 * 2. Every room tool must advertise an explicit typed success payload, not the
 *    old catch-all schema, and output validation must actually catch a handler
 *    that forgets a required success field.
 */
import { describe, expect, test } from "bun:test";

import { schemaToZod, toShape } from "../src/lib/mcp/schema-to-zod";
import { responseValidator, advertisedOutputShape } from "../src/lib/mcp/response";

describe("schemaToZod preserves constraints", () => {
  test("string enum becomes a closed set", () => {
    const s = schemaToZod({ type: "string", enum: ["topic", "universal", "personal"] });
    expect(s.safeParse("topic").success).toBe(true);
    expect(s.safeParse("nope").success).toBe(false);
  });

  test("length, pattern and format are enforced", () => {
    const alias = schemaToZod({ type: "string", minLength: 2, maxLength: 8, pattern: "^[a-z]+$" });
    expect(alias.safeParse("ok").success).toBe(true);
    expect(alias.safeParse("a").success).toBe(false);
    expect(alias.safeParse("waytoolongalias").success).toBe(false);
    expect(alias.safeParse("Nope1").success).toBe(false);

    expect(schemaToZod({ type: "string", format: "uuid" }).safeParse("not-a-uuid").success).toBe(false);
    expect(schemaToZod({ type: "string", format: "uri" }).safeParse("https://crawler.today").success).toBe(true);
  });

  test("integer vs number and numeric bounds", () => {
    const amount = schemaToZod({ type: "integer", minimum: 10, maximum: 100 });
    expect(amount.safeParse(10).success).toBe(true);
    expect(amount.safeParse(10.5).success).toBe(false);
    expect(amount.safeParse(9).success).toBe(false);
    expect(amount.safeParse(101).success).toBe(false);
    expect(schemaToZod({ type: "number", exclusiveMinimum: 0 }).safeParse(0).success).toBe(false);
  });

  test("array item schemas and item counts", () => {
    const tags = schemaToZod({ type: "array", items: { type: "string", maxLength: 3 }, minItems: 1, maxItems: 2 });
    expect(tags.safeParse(["ab"]).success).toBe(true);
    expect(tags.safeParse([]).success).toBe(false);
    expect(tags.safeParse(["ab", "cd", "ef"]).success).toBe(false);
    expect(tags.safeParse(["abcd"]).success).toBe(false);
    expect(tags.safeParse([1]).success).toBe(false);
  });

  test("additionalProperties: false stays closed", () => {
    const strict = schemaToZod({
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
      additionalProperties: false,
    });
    expect(strict.safeParse({ a: "x" }).success).toBe(true);
    expect(strict.safeParse({ a: "x", b: 1 }).success).toBe(false);
  });

  test("nullable in both spellings", () => {
    expect(schemaToZod({ type: ["string", "null"] }).safeParse(null).success).toBe(true);
    expect(schemaToZod({ type: "string", nullable: true }).safeParse(null).success).toBe(true);
    expect(schemaToZod({ type: "string" }).safeParse(null).success).toBe(false);
  });

  test("toShape keeps optionality per required list", () => {
    const shape = toShape({
      type: "object",
      properties: { a: { type: "string" }, b: { type: "integer" } },
      required: ["a"],
    });
    expect(shape["a"]!.isOptional()).toBe(false);
    expect(shape["b"]!.isOptional()).toBe(true);
  });
});

describe("shared response envelope", () => {
  const success = {
    type: "object",
    properties: { room_id: { type: "string" }, member_count: { type: "integer" } },
    required: ["room_id", "member_count"],
  };

  test("success branch requires every declared success field", () => {
    const v = responseValidator(success);
    expect(v.safeParse({ status: "ok", room_id: "r1", member_count: 3 }).success).toBe(true);
    // A handler that forgot member_count must NOT validate.
    expect(v.safeParse({ status: "ok", room_id: "r1" }).success).toBe(false);
    expect(v.safeParse({ status: "ok", room_id: "r1", member_count: "3" }).success).toBe(false);
  });

  test("error envelope is machine readable", () => {
    const v = responseValidator(success);
    expect(
      v.safeParse({
        status: "error",
        code: "IDENTITY_CONFLICT",
        message: "…",
        retryable: false,
        correlation_id: "c1",
      }).success,
    ).toBe(true);
    expect(v.safeParse({ status: "error", code: "X" }).success).toBe(false);
  });

  test("upgrade envelope always names a plan and a route", () => {
    const v = responseValidator(success);
    const base = {
      status: "upgrade_required" as const,
      code: "PLAN_REQUIRED",
      message: "…",
      retryable: false as const,
      correlation_id: "c1",
      current_plan: "free",
      cta_label: "Upgrade",
      upgrade_url: "https://crawler.today/pricing",
    };
    expect(v.safeParse({ ...base, required_plan: "business" }).success).toBe(true);
    expect(v.safeParse({ ...base, plan_required: null }).success).toBe(false);
    expect(v.safeParse({ ...base }).success).toBe(false);
  });

  test("advertised shape carries the discriminator and the envelope", () => {
    const shape = advertisedOutputShape(success);
    expect(Object.keys(shape)).toContain("status");
    expect(Object.keys(shape)).toContain("upgrade_url");
    expect(shape["room_id"]!.isOptional()).toBe(true);
  });
});

describe("every room tool declares an explicit output contract", () => {
  const files = [
    "../src/lib/room/mcp",
    "../src/lib/room/mcp.personal",
    "../src/lib/room/mcp.plus",
    "../src/lib/room/mcp.profile",
    "../src/lib/room/mcp.sugar",
    "../src/lib/room/mcp.love",
    "../src/lib/room/match/mcp",
    "../src/lib/room/social/mcp",
  ];

  test("no tool falls back to an untyped success payload", async () => {
    const untyped: string[] = [];
    for (const file of files) {
      const mod = (await import(file)) as Record<string, unknown>;
      for (const value of Object.values(mod)) {
        if (!Array.isArray(value)) continue;
        for (const tool of value as Array<Record<string, any>>) {
          if (!tool || typeof tool.name !== "string" || !tool.inputSchema) continue;
          const props = tool.outputSchema?.properties ?? {};
          const required = tool.outputSchema?.required ?? [];
          if (!Object.keys(props).length || !required.length) untyped.push(tool.name);
        }
      }
    }
    expect(untyped).toEqual([]);
  });
});
