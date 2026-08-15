/**
 * Acceptance gate: runtime tool inventory, MCP manifest, ChatGPT submission and
 * the entitlement catalogue must agree exactly.
 *
 * Run: bun scripts/check-tool-parity.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import mcp from "../src/lib/mcp/index";
import { roomTools } from "../src/lib/mcp/tools/room-tools";
import { CRAWLER_MCP_NAME, CRAWLER_MCP_TITLE, CRAWLER_VERSION } from "../src/lib/version";
import { PLAN_DEFINITIONS, PLAN_ORDER, ADMIN_TOOLS, isKnownTool } from "../src/lib/entitlements/plans";
import { requiredPlanForTool } from "../src/lib/entitlements/catalog";

let failures = 0;
const check = (label: string, fn: () => void) => {
  try {
    fn();
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${label}: ${(error as Error).message}`);
  }
};

type AnyTool = {
  name: string;
  title?: string;
  description?: string;
  annotations?: Record<string, unknown>;
};

const runtimeTools = (mcp as unknown as { tools: AnyTool[] }).tools;
const runtimeNames = runtimeTools.map((t) => t.name).sort();
const roomToolNames = (roomTools as unknown as AnyTool[]).map((t) => t.name);

type SchemaTool = AnyTool & { inputSchema?: unknown; outputSchema?: unknown };

const manifest = JSON.parse(readFileSync(".lovable/mcp/manifest.json", "utf8")) as {
  mcp: { server: { name: string; title?: string; version?: string }; tools: SchemaTool[] };
};
const submission = JSON.parse(readFileSync("chatgpt-app-submission.json", "utf8")) as {
  $schema: string;
  mcp_server: { name: string; version: string };
  tools: {
    name: string;
    title?: string;
    description?: string;
    read_only?: boolean;
    destructive?: boolean;
    idempotent?: boolean;
    open_world?: boolean;
    input_schema?: unknown;
    output_schema?: unknown;
  }[];
};

check("runtime tool names are unique", () => {
  assert.equal(new Set(runtimeNames).size, runtimeNames.length);
});

check("manifest parity", () => {
  assert.deepEqual(manifest.mcp.tools.map((t) => t.name).sort(), runtimeNames);
});

check("submission parity", () => {
  assert.deepEqual(submission.tools.map((t) => t.name).sort(), runtimeNames);
});

check("manifest annotations match the runtime registry", () => {
  const byName = new Map(manifest.mcp.tools.map((t) => [t.name, t]));
  for (const tool of runtimeTools) {
    const m = byName.get(tool.name);
    assert.ok(m, `missing in manifest: ${tool.name}`);
    assert.deepEqual(m!.annotations, tool.annotations, `annotation drift: ${tool.name}`);
    assert.equal(m!.title, tool.title, `title drift: ${tool.name}`);
    assert.equal(m!.description, tool.description, `description drift: ${tool.name}`);
  }
});

check("submission mirrors manifest name, annotations, input and output schema", () => {
  const byName = new Map(manifest.mcp.tools.map((t) => [t.name, t]));
  for (const tool of submission.tools) {
    const m = byName.get(tool.name);
    assert.ok(m, `submission tool missing in manifest: ${tool.name}`);
    const a = (m!.annotations ?? {}) as Record<string, unknown>;
    assert.equal(tool.title, m!.title, `title drift: ${tool.name}`);
    assert.equal(tool.description, m!.description, `description drift: ${tool.name}`);
    assert.equal(tool.read_only, a["readOnlyHint"], `read_only drift: ${tool.name}`);
    assert.equal(tool.destructive, a["destructiveHint"], `destructive drift: ${tool.name}`);
    assert.equal(tool.idempotent, a["idempotentHint"], `idempotent drift: ${tool.name}`);
    assert.equal(tool.open_world, a["openWorldHint"], `open_world drift: ${tool.name}`);
    assert.deepEqual(tool.input_schema, m!.inputSchema, `input schema drift: ${tool.name}`);
    assert.deepEqual(tool.output_schema, m!.outputSchema, `output schema drift: ${tool.name}`);
  }
});

check("every room-domain output schema carries the shared envelope", () => {
  const bad: string[] = [];
  for (const tool of manifest.mcp.tools.filter((t) => roomToolNames.includes(t.name))) {
    const schema = tool.outputSchema as
      | { properties?: Record<string, { enum?: unknown[] }> }
      | undefined;
    const props = schema?.properties ?? {};
    const status = props["status"];
    if (!status || !Array.isArray(status.enum) || !status.enum.includes("ok")) bad.push(tool.name);
    else if (!props["code"] || !props["correlation_id"] || !props["required_plan"]) bad.push(tool.name);
  }
  assert.deepEqual(bad, [], `tools without the shared response envelope: ${bad.join(", ")}`);
});

check("room-domain tools advertise their own success fields", () => {
  const byName = new Map(manifest.mcp.tools.map((t) => [t.name, t]));
  const generic = new Set([
    "status",
    "room_token",
    "code",
    "message",
    "retryable",
    "correlation_id",
    "required_plan",
    "current_plan",
    "cta_label",
    "upgrade_url",
  ]);
  const missing: string[] = [];
  for (const tool of roomToolNames) {
    const schema = byName.get(tool)?.outputSchema as { properties?: Record<string, unknown> } | undefined;
    const own = Object.keys(schema?.properties ?? {}).filter((key) => !generic.has(key));
    if (own.length === 0) missing.push(tool);
  }
  assert.deepEqual(missing, [], `room tools still on the generic output contract: ${missing.join(", ")}`);
});

check("no OPEN_OUTPUT and no obsolete generic contract remains", () => {
  const sources = ["src/lib/room/mcp.ts", "src/lib/room/mcp.personal.ts", "src/lib/room/mcp.plus.ts", "src/lib/room/mcp.profile.ts", "src/lib/room/mcp.sugar.ts", "src/lib/room/mcp.love.ts", "src/lib/room/match/mcp.ts", "src/lib/room/social/mcp.ts"];
  for (const file of sources) {
    assert.ok(!readFileSync(file, "utf8").includes("OPEN_OUTPUT"), `OPEN_OUTPUT still present in ${file}`);
  }
});

check("submission uses the ChatGPT app submission v1 schema", () => {
  assert.equal(submission.$schema, "https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json");
});

check("obsolete tools are gone", () => {
  assert.ok(!runtimeNames.includes("create_private_room"));
  assert.ok(!submission.tools.some((t) => t.name === "create_private_room"));
});

check("one version / name source", () => {
  assert.equal(manifest.mcp.server.name, CRAWLER_MCP_NAME);
  assert.equal(manifest.mcp.server.title ?? CRAWLER_MCP_TITLE, CRAWLER_MCP_TITLE);
  assert.equal(manifest.mcp.server.version, CRAWLER_VERSION);
  assert.equal(submission.mcp_server.version, CRAWLER_VERSION);
});

check("every tool is mapped to exactly one plan", () => {
  const seen = new Map<string, string[]>();
  for (const plan of PLAN_ORDER) {
    for (const tool of PLAN_DEFINITIONS[plan].tools) {
      seen.set(tool, [...(seen.get(tool) ?? []), plan]);
    }
  }
  for (const tool of ADMIN_TOOLS) seen.set(tool, [...(seen.get(tool) ?? []), "admin"]);

  const duplicates = [...seen.entries()].filter(([, plans]) => plans.length > 1);
  assert.deepEqual(duplicates, [], `tools mapped more than once: ${JSON.stringify(duplicates)}`);

  const unmapped = runtimeNames.filter((name) => !seen.has(name));
  assert.deepEqual(unmapped, [], `runtime tools without a plan: ${unmapped.join(", ")}`);

  const ghosts = [...seen.keys()].filter((name) => !runtimeNames.includes(name));
  assert.deepEqual(ghosts, [], `catalogue tools that do not exist at runtime: ${ghosts.join(", ")}`);
});

check("unknown tools fail closed", () => {
  assert.equal(isKnownTool("totally_made_up_tool"), false);
  assert.equal(requiredPlanForTool("totally_made_up_tool"), "admin");
});

check("every tool declares complete annotations", () => {
  const incomplete = runtimeTools
    .filter((t) => {
      const a = t.annotations ?? {};
      return (
        typeof a["readOnlyHint"] !== "boolean" ||
        typeof a["idempotentHint"] !== "boolean" ||
        typeof a["destructiveHint"] !== "boolean" ||
        typeof a["openWorldHint"] !== "boolean"
      );
    })
    .map((t) => t.name);
  assert.deepEqual(incomplete, [], `tools with incomplete annotations: ${incomplete.join(", ")}`);
});

check("every tool has a title and a description", () => {
  const bad = runtimeTools.filter((t) => !t.title?.trim() || !t.description?.trim()).map((t) => t.name);
  assert.deepEqual(bad, []);
});

check("mutating tools are never declared read-only", () => {
  const mutatingPrefixes = [
    "send_",
    "create_",
    "update_",
    "delete_",
    "publish_",
    "set_",
    "start_",
    "submit_",
    "join_",
    "leave_",
    "block_",
    "follow_",
    "unfollow_",
    "like_",
    "unlike_",
    "respond_",
    "activate_",
    "pause_",
    "close_",
    "open_pair_room",
    "manage_",
    "report_",
    "hide_",
    "change_",
    "answer_",
    "add_",
    "finalize_",
    "import_",
    "continue_",
    "enter_",
  ];
  const offenders = runtimeTools
    .filter(
      (t) =>
        (t.annotations?.["readOnlyHint"] as boolean | undefined) === true &&
        mutatingPrefixes.some((prefix) => t.name.startsWith(prefix)),
    )
    .map((t) => t.name);
  assert.deepEqual(offenders, [], `read-only tools that mutate: ${offenders.join(", ")}`);
});

check("public instructions use the @crawler connector name", () => {
  const instructions = (mcp as unknown as { instructions: string }).instructions;
  assert.ok(!/@crawlers\b/.test(instructions), "found @crawlers");
  assert.ok(instructions.length > 200);
  assert.ok(
    instructions.slice(0, 512).includes("search_entities") && instructions.slice(0, 512).includes("start_interview"),
    "essential routing must live in the first 512 characters",
  );
});

console.log(`Runtime tools: ${runtimeNames.length}`);
console.log(`Room-domain tools: ${roomToolNames.length}`);
console.log(
  `Read-only tools: ${runtimeTools.filter((t) => t.annotations?.["readOnlyHint"] === true).length}`,
);
console.log(failures ? `${failures} check(s) failed` : "All MCP contract parity checks passed");
if (failures) process.exit(1);
