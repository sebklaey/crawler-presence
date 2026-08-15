/**
 * Output validation must be enforced unconditionally.
 *
 * These tests run with NO special environment variable: a handler payload that
 * violates the declared contract must never reach the caller. Instead the
 * adapter emits one safe typed OUTPUT_CONTRACT_VIOLATION error that itself
 * satisfies the advertised error envelope.
 *
 * Run: bun test tests/output-contract.test.ts
 */
import { describe, expect, test } from "bun:test";

import { validateOutput, roomToolContracts } from "../src/lib/mcp/tools/room-tools";
import { responseValidator } from "../src/lib/mcp/response";

const NAME = "__contract_probe__";
roomToolContracts.set(
  NAME,
  responseValidator({
    type: "object",
    properties: { room_id: { type: "string" }, member_count: { type: "integer" } },
    required: ["room_id", "member_count"],
  }),
);

describe("validateOutput", () => {
  test("no environment flag is required — enforcement is always on", () => {
    expect(process.env["CRAWLER_STRICT_OUTPUT"]).toBeUndefined();
  });

  test("a valid success payload passes through untouched", () => {
    const payload = { status: "ok", room_id: "r1", member_count: 2 };
    expect(validateOutput(NAME, payload)).toEqual(payload);
  });

  test("a missing required success field cannot escape", () => {
    const out = validateOutput(NAME, { status: "ok", room_id: "r1" });
    expect(out["status"]).toBe("error");
    expect(out["code"]).toBe("OUTPUT_CONTRACT_VIOLATION");
    expect(out["retryable"]).toBe(false);
    expect(typeof out["correlation_id"]).toBe("string");
    expect(out["room_id"]).toBeUndefined();
    expect(out["member_count"]).toBeUndefined();
  });

  test("a wrongly typed success field cannot escape", () => {
    const out = validateOutput(NAME, { status: "ok", room_id: "r1", member_count: "two" });
    expect(out["code"]).toBe("OUTPUT_CONTRACT_VIOLATION");
  });

  test("the violation error itself satisfies the advertised schema", () => {
    const out = validateOutput(NAME, { status: "ok" });
    const validator = roomToolContracts.get(NAME)!;
    expect(validator.safeParse(out).success).toBe(true);
  });

  test("valid envelopes are never rewritten", () => {
    const err = {
      status: "error",
      code: "IDENTITY_REQUIRED",
      message: "…",
      retryable: false,
      correlation_id: "c1",
    };
    expect(validateOutput(NAME, err)).toEqual(err);
  });
});
