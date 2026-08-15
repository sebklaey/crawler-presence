/**
 * JSON Schema → Zod converter for Crawler's MCP tool descriptors.
 *
 * The Room/Profile/Sugar/Love/Match/Campaign/Social tool descriptors are plain
 * JSON Schema; the MCP SDK wants zod. The previous converter threw away every
 * constraint (enums became `z.string()`, numbers lost their bounds, objects were
 * always passthrough), so invalid model input reached the handlers.
 *
 * Supported: string enum/const, minLength/maxLength/pattern, format (email, uri,
 * uuid, date-time), integer vs number with minimum/maximum/exclusive bounds,
 * arrays with items + minItems/maxItems, objects with required/
 * additionalProperties, nullable (both `nullable: true` and `type: [x, "null"]`),
 * oneOf/anyOf unions, defaults and descriptions.
 */
import { z } from "zod";

export type JsonSchema = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

function stringSchema(node: JsonSchema): z.ZodTypeAny {
  let s = z.string();
  const min = num(node["minLength"]);
  const max = num(node["maxLength"]);
  if (min !== undefined) s = s.min(min);
  if (max !== undefined) s = s.max(max);
  const pattern = str(node["pattern"]);
  if (pattern) {
    try {
      s = s.regex(new RegExp(pattern));
    } catch {
      /* an unsupported regex must not break tool registration */
    }
  }
  switch (str(node["format"])) {
    case "email":
      s = s.email();
      break;
    case "uri":
    case "url":
      s = s.url();
      break;
    case "uuid":
      s = s.uuid();
      break;
    case "date-time":
      s = s.datetime({ offset: true });
      break;
    default:
      break;
  }
  return s;
}

function numberSchema(node: JsonSchema, integer: boolean): z.ZodTypeAny {
  let n = z.number();
  if (integer) n = n.int();
  const min = num(node["minimum"]);
  const max = num(node["maximum"]);
  const exMin = num(node["exclusiveMinimum"]);
  const exMax = num(node["exclusiveMaximum"]);
  if (min !== undefined) n = n.min(min);
  if (max !== undefined) n = n.max(max);
  if (exMin !== undefined) n = n.gt(exMin);
  if (exMax !== undefined) n = n.lt(exMax);
  return n;
}

function arraySchema(node: JsonSchema): z.ZodTypeAny {
  const items = (node["items"] as JsonSchema | undefined) ?? {};
  let a = z.array(schemaToZod(items));
  const min = num(node["minItems"]);
  const max = num(node["maxItems"]);
  if (min !== undefined) a = a.min(min);
  if (max !== undefined) a = a.max(max);
  return a;
}

function objectSchema(node: JsonSchema): z.ZodTypeAny {
  const props = (node["properties"] as Record<string, JsonSchema> | undefined) ?? {};
  const required = (node["required"] as string[] | undefined) ?? [];
  const additional = node["additionalProperties"];

  if (!Object.keys(props).length) {
    // A pure bag of unknown keys: `false` still means "nothing allowed".
    if (additional === false) return z.object({}).strict();
    if (additional && typeof additional === "object") {
      return z.record(schemaToZod(additional as JsonSchema));
    }
    return z.record(z.any());
  }

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, value] of Object.entries(props)) {
    const inner = schemaToZod(value);
    shape[key] = required.includes(key) ? inner : inner.optional();
  }
  const base = z.object(shape);
  if (additional === false) return base.strict();
  if (additional && typeof additional === "object") return base.catchall(schemaToZod(additional as JsonSchema));
  return base.passthrough();
}

/** Converts a single JSON Schema node into an equivalent zod schema. */
export function schemaToZod(node: JsonSchema): z.ZodTypeAny {
  const variants = (node["oneOf"] ?? node["anyOf"]) as JsonSchema[] | undefined;
  if (Array.isArray(variants) && variants.length) {
    const parts = variants.map((v) => schemaToZod(v));
    const union =
      parts.length === 1 ? (parts[0] as z.ZodTypeAny) : z.union(parts as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
    return decorate(union, node);
  }

  if ("const" in node) return decorate(z.literal(node["const"] as never), node);

  const enumValues = node["enum"];
  if (Array.isArray(enumValues) && enumValues.length) {
    if (enumValues.every((v) => typeof v === "string")) {
      const values = enumValues as string[];
      const enumSchema =
        values.length === 1
          ? z.literal(values[0] as string)
          : z.enum(values as [string, string, ...string[]]);
      return decorate(enumSchema, node);
    }
    return decorate(
      z.union(
        enumValues.map((v) => z.literal(v as never)) as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
      ),
      node,
    );
  }

  const rawType = node["type"];
  // `type: ["string", "null"]` — JSON Schema's other way of saying nullable.
  if (Array.isArray(rawType)) {
    const nonNull = rawType.filter((t) => t !== "null");
    const nullable = nonNull.length !== rawType.length;
    const parts = nonNull.map((t) => schemaToZod({ ...node, type: t }));
    const union =
      parts.length === 0
        ? z.null()
        : parts.length === 1
          ? (parts[0] as z.ZodTypeAny)
          : z.union(parts as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
    return decorate(nullable ? union.nullable() : union, node);
  }

  let base: z.ZodTypeAny;
  switch (rawType) {
    case "string":
      base = stringSchema(node);
      break;
    case "integer":
      base = numberSchema(node, true);
      break;
    case "number":
      base = numberSchema(node, false);
      break;
    case "boolean":
      base = z.boolean();
      break;
    case "null":
      base = z.null();
      break;
    case "array":
      base = arraySchema(node);
      break;
    case "object":
      base = objectSchema(node);
      break;
    default:
      base = z.any();
      break;
  }
  return decorate(node["nullable"] === true ? base.nullable() : base, node);
}

function decorate(schema: z.ZodTypeAny, node: JsonSchema): z.ZodTypeAny {
  let out = schema;
  const description = str(node["description"]);
  if (description) out = out.describe(description);
  if ("default" in node) out = out.default(node["default"] as never);
  return out;
}

/**
 * Converts a top-level object schema into the raw zod shape the MCP SDK wants.
 * Constraints of each property are preserved; only presence is relaxed for
 * properties the descriptor does not list as required.
 */
export function toShape(schema: JsonSchema): Record<string, z.ZodTypeAny> {
  const props = (schema["properties"] as Record<string, JsonSchema> | undefined) ?? {};
  const required = (schema["required"] as string[] | undefined) ?? [];
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, value] of Object.entries(props)) {
    const inner = schemaToZod(value);
    shape[key] = required.includes(key) ? inner : inner.optional();
  }
  return shape;
}
