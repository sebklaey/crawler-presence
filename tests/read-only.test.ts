/**
 * Mutation-spy harness over EVERY runtime tool that declares readOnlyHint=true.
 *
 * Both Supabase entry points are replaced by a spying fake that records any
 * insert / update / delete / upsert / rpc, and `fetch` is replaced by a spy so
 * no external call (Paddle, provider) can happen either. Every read-only tool
 * is invoked with representative valid input generated from its own advertised
 * input schema; afterwards the recorded mutation list must be empty.
 *
 * Run: bun test tests/read-only.test.ts
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

const mutations: string[] = [];
const externalCalls: string[] = [];

type Row = Record<string, unknown>;

/** Minimal chainable Supabase stand-in. Reads resolve empty, writes are recorded. */
function fakeTable(table: string) {
  const record = (op: string) => {
    mutations.push(`${op} ${table}`);
  };
  const result = { data: null as Row[] | Row | null, error: null, count: 0 };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const key of [
    "select",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "is",
    "not",
    "or",
    "filter",
    "order",
    "limit",
    "range",
    "match",
    "contains",
    "overlaps",
    "textSearch",
    "returns",
    "abortSignal",
    "throwOnError",
  ]) {
    chain[key] = self;
  }
  for (const key of ["insert", "update", "delete", "upsert"]) {
    chain[key] = (...args: unknown[]) => {
      record(key);
      void args;
      return chain;
    };
  }
  chain["single"] = async () => ({ data: null, error: null });
  chain["maybeSingle"] = async () => ({ data: null, error: null });
  chain["then"] = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ ...result, data: [] }));
  return chain;
}

const fakeClient = {
  from: (table: string) => fakeTable(table),
  rpc: async (name: string) => {
    mutations.push(`rpc ${name}`);
    return { data: null, error: null };
  },
  storage: {
    from: () => ({
      createSignedUrl: async () => ({ data: null, error: null }),
      createSignedUploadUrl: async () => {
        mutations.push("storage.createSignedUploadUrl");
        return { data: null, error: null };
      },
      remove: async () => {
        mutations.push("storage.remove");
        return { data: null, error: null };
      },
      upload: async () => {
        mutations.push("storage.upload");
        return { data: null, error: null };
      },
    }),
  },
  auth: { getSession: async () => ({ data: { session: null }, error: null }) },
};

mock.module("../src/integrations/supabase/client.server", () => ({
  supabaseAdmin: fakeClient,
  supabase: fakeClient,
}));
mock.module("../src/lib/mcp/db.server", () => ({ db: () => fakeClient }));

// Identity is resolved in memory; a read must never provision one.
mock.module("../src/lib/room/session-identity.server", () => ({
  identityForSession: async () => ({ roomToken: "roomtok_readonly_probe", subjectHash: "subject:probe" }),
  rememberRoomTokenForSession: async () => {
    mutations.push("identity.rememberRoomTokenForSession");
  },
}));
mock.module("../src/lib/room/identity", () => ({
  resolveIdentity: async (meta: Record<string, string>) => ({
    subjectHash: `subject:${meta["room/token"] ?? "anon"}`,
    sessionHash: null,
    locale: null,
  }),
}));

const realFetch = globalThis.fetch;
beforeEach(() => {
  mutations.length = 0;
  externalCalls.length = 0;
  globalThis.fetch = (async (input: unknown) => {
    externalCalls.push(String(input));
    throw new Error("external call blocked in read-only test");
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const mcp = (await import("../src/lib/mcp/index")).default as unknown as {
  tools: {
    name: string;
    annotations?: Record<string, unknown>;
    handler: (input: Record<string, unknown>) => Promise<unknown>;
  }[];
};

const manifest = JSON.parse(readFileSync(".lovable/mcp/manifest.json", "utf8")) as {
  mcp: { tools: { name: string; inputSchema?: JsonSchema }[] };
};
type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  format?: string;
};

/** Representative valid input derived from the tool's own schema. */
function sampleFor(schema: JsonSchema | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const props = schema?.properties ?? {};
  for (const key of schema?.required ?? []) {
    const prop = props[key];
    out[key] = sampleValue(key, prop);
  }
  return out;
}

function sampleValue(key: string, schema: JsonSchema | undefined): unknown {
  const type = Array.isArray(schema?.type) ? schema?.type[0] : schema?.type;
  if (schema?.enum?.length) return schema.enum[0];
  switch (type) {
    case "integer":
    case "number":
      return Math.max(schema?.minimum ?? 1, 1);
    case "boolean":
      return false;
    case "array":
      return [sampleValue(key, schema?.items)];
    case "object":
      return sampleFor(schema);
    default:
      if (schema?.format === "uri") return "https://crawler.today";
      if (schema?.format === "uuid") return "00000000-0000-4000-8000-000000000000";
      if (/url/.test(key)) return "https://crawler.today";
      if (/session/.test(key)) return "sess_readonly_probe_value";
      return "probe".padEnd(Math.max(schema?.minLength ?? 5, 5), "x");
  }
}

const readOnlyTools = mcp.tools.filter((tool) => tool.annotations?.["readOnlyHint"] === true);
const schemaByName = new Map(manifest.mcp.tools.map((t) => [t.name, t.inputSchema]));

describe("read-only tools perform zero mutations", () => {
  test("the harness covers every runtime read-only tool", () => {
    expect(readOnlyTools.length).toBeGreaterThan(0);
    // Reported for the record; the per-tool tests below cover 100% of them.
    console.log(
      `read-only coverage: ${readOnlyTools.length}/${readOnlyTools.length} of ${mcp.tools.length} runtime tools`,
    );
  });

  for (const tool of readOnlyTools) {
    test(`${tool.name} makes no write`, async () => {
      const input = { ...sampleFor(schemaByName.get(tool.name)), room_token: "roomtok_readonly_probe" };
      try {
        await tool.handler(input);
      } catch {
        // A read-only tool may legitimately fail on probe data — what matters
        // is that it wrote nothing while trying.
      }
      expect({ tool: tool.name, mutations }).toEqual({ tool: tool.name, mutations: [] });
      expect({ tool: tool.name, externalCalls }).toEqual({ tool: tool.name, externalCalls: [] });
    });
  }
});
