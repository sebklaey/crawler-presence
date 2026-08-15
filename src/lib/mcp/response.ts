/**
 * One shared response model for every Crawler MCP tool.
 *
 * Every tool answers with exactly one of four discriminated variants:
 *
 *   status = "ok"                      → the tool's own typed success payload
 *   status = "error"                   → typed error envelope
 *   status = "upgrade_required"        → entitlement envelope (also "limit_reached")
 *   status = "temporarily_unavailable" → retryable outage envelope
 *
 * The MCP SDK advertises a raw zod *shape*, which cannot express `oneOf`, so the
 * advertised schema carries the discriminator plus every possible field, while
 * `responseValidator()` builds the real discriminated union used to validate
 * what a handler actually returned. That validator is strict about the success
 * payload: a missing required success field fails, it is not silently optional.
 */
import { z } from "zod";

import { schemaToZod, toShape, type JsonSchema } from "./schema-to-zod";

export const RESPONSE_STATUSES = [
  "ok",
  "error",
  "upgrade_required",
  "limit_reached",
  "temporarily_unavailable",
] as const;

export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

/** Machine-readable failure envelope shared by every tool. */
export const errorEnvelopeShape = {
  status: z.enum(["error", "temporarily_unavailable"]),
  code: z.string().describe("Stable machine-readable error code, e.g. IDENTITY_CONFLICT."),
  message: z.string().describe("Human-readable explanation."),
  retryable: z.boolean().describe("true when the same call can succeed later without any change."),
  correlation_id: z.string().describe("Quote this id in support requests."),
} as const;

/** Entitlement envelope: the call is valid but the plan does not include it. */
export const upgradeEnvelopeShape = {
  status: z.enum(["upgrade_required", "limit_reached"]),
  code: z.string(),
  message: z.string(),
  retryable: z.literal(false),
  correlation_id: z.string(),
  required_plan: z.enum(["plus", "pro", "business", "admin"]),
  current_plan: z.enum(["free", "plus", "pro", "business"]),
  cta_label: z.string(),
  upgrade_url: z.string(),
  usage: z
    .object({ used: z.number(), max: z.number(), unit: z.string() })
    .partial()
    .optional()
    .describe("Present when a numeric plan limit was reached."),
} as const;

/**
 * `status` is the reserved discriminator of the shared envelope. A few domain
 * schemas declare their own `status` (e.g. "pending_review"); that field is
 * advertised and validated as `result_status` so the discriminator always wins
 * and no domain value can masquerade as an envelope state.
 */
export const RESERVED_DISCRIMINATOR = "status";
export const DOMAIN_STATUS_FIELD = "result_status";

function renameReserved<T>(entries: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(entries)) {
    out[key === RESERVED_DISCRIMINATOR ? DOMAIN_STATUS_FIELD : key] = value;
  }
  return out;
}

/** Applies the same rename to a raw JSON Schema before validation. */
function withRenamedStatus(schema: JsonSchema | undefined): JsonSchema | undefined {
  if (!schema || typeof schema !== "object") return schema;
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (!props || !(RESERVED_DISCRIMINATOR in props)) return schema;
  const required = ((schema as { required?: string[] }).required ?? []).map((k) =>
    k === RESERVED_DISCRIMINATOR ? DOMAIN_STATUS_FIELD : k,
  );
  return { ...schema, properties: renameReserved(props), required } as JsonSchema;
}

const ROOM_TOKEN = z
  .string()
  .optional()
  .describe("Anonymous room identity. Store it and pass it to every later room tool — there is no account.");

/**
 * Advertised output shape for one tool: the discriminator, the tool's own
 * success fields (optional at advertisement level because errors omit them) and
 * the shared envelopes.
 */
export function advertisedOutputShape(successSchema: JsonSchema | undefined): Record<string, z.ZodTypeAny> {
  const success: Record<string, z.ZodTypeAny> = {};
  for (const [key, value] of Object.entries(renameReserved(toShape(successSchema ?? {})))) {
    success[key] = value.isOptional() ? value : value.optional();
  }
  return {
    status: z
      .enum(RESPONSE_STATUSES)
      .describe('Discriminator: "ok" carries the success payload, every other value carries the shared envelope.'),
    ...success,
    room_token: ROOM_TOKEN,
    code: z.string().optional().describe("Error code when status is not ok."),
    message: z.string().optional(),
    retryable: z.boolean().optional(),
    correlation_id: z.string().optional(),
    required_plan: z.string().optional().describe("Plan that unlocks this feature: plus, pro, business or admin."),
    current_plan: z.string().optional(),
    cta_label: z.string().optional(),
    upgrade_url: z.string().optional().describe("Direct checkout link for the required plan."),
  };
}

/**
 * The real contract used for validation: a discriminated union in which the
 * success branch keeps every required field of the tool's own payload.
 */
export function responseValidator(successSchema: JsonSchema | undefined) {
  const declared = schemaToZod({
    type: "object",
    additionalProperties: true,
    ...(withRenamedStatus(successSchema) ?? {}),
  });
  const successObject =
    declared instanceof z.ZodObject ? declared : z.object({}).passthrough();

  return z.union([
    successObject.extend({ status: z.literal("ok"), room_token: ROOM_TOKEN }).passthrough(),
    z.object({ ...errorEnvelopeShape, room_token: ROOM_TOKEN }).passthrough(),
    z.object({ ...upgradeEnvelopeShape, room_token: ROOM_TOKEN }).passthrough(),
  ]);
}

export type ToolResponseValidator = ReturnType<typeof responseValidator>;
