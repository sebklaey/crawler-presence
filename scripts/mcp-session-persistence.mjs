/**
 * End-to-end persistence check for the public MCP endpoint.
 *
 * Performs four SEPARATE HTTP requests (so nothing can be served from a single
 * worker's memory):
 *   1. start_interview
 *   2. get_knowledge_core        -> must already contain the name + facts
 *   3. continue_interview
 *   4. get_knowledge_core        -> must show the evolved core
 *
 * Usage: node scripts/mcp-session-persistence.mjs [origin]
 *   default origin: http://localhost:8080
 */
const origin = process.argv[2] ?? "http://localhost:8080";
const endpoint = `${origin.replace(/\/$/, "")}/mcp`;

let id = 0;
async function rpc(method, params) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const text = await res.text();
  const json = text.startsWith("event:")
    ? JSON.parse(text.split("\n").find((l) => l.startsWith("data:")).slice(5))
    : JSON.parse(text);
  if (json.error) throw new Error(`${method} failed: ${JSON.stringify(json.error)}`);
  return json.result;
}

const call = async (name, args) => {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name} error: ${JSON.stringify(result.content)}`);
  return result.structuredContent;
};

function assert(cond, message) {
  if (!cond) {
    console.error(`FAIL  ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok    ${message}`);
  }
}

const main = async () => {
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "crawler-persistence-test", version: "1" },
  });

  // 1 — start
  const started = await call("start_interview", {
    free_text: "Crawler persistence check: a small documentary photography project in Bern.",
  });
  const sessionId = started.session_id;
  console.log(`session ${sessionId}`);
  assert(typeof sessionId === "string" && sessionId.startsWith("sess_"), "start_interview returns opaque session id");
  const startName = started.knowledge_core_summary?.name ?? "";
  const startFacts = (started.verified_facts ?? []).length;
  assert(
    startName.length > 0 || startFacts > 0,
    `start_interview produced knowledge (name "${startName}", ${startFacts} verified facts)`,
  );

  // 2 — independent read
  const read1 = await call("get_knowledge_core", { session_id: sessionId });
  assert(read1.knowledge_core?.name === startName, `core persisted across requests (name "${read1.knowledge_core?.name}")`);
  assert(
    read1.presence_score === started.presence_score,
    `presence score persisted (${read1.presence_score})`,
  );
  assert(
    (read1.knowledge_core?.facts ?? []).length > 0 &&
      (read1.knowledge_core?.facts ?? []).length >= startFacts,
    `facts persisted (${(read1.knowledge_core?.facts ?? []).length} >= ${startFacts})`,
  );
  assert(read1.confidence === started.confidence, `confidence persisted (${read1.confidence})`);

  // 3 — continue
  const continued = await call("continue_interview", {
    session_id: sessionId,
    user_answer:
      "We are based in Bern, founded in 2019, and we document alpine farming communities. Contact: hello@example.com",
  });
  assert(continued.session_id === sessionId, "continue_interview keeps the same session id");

  // 4 — independent read again
  const read2 = await call("get_knowledge_core", { session_id: sessionId });
  const facts2 = (read2.knowledge_core?.facts ?? []).length;
  assert(facts2 >= (read1.knowledge_core?.facts ?? []).length, `core evolved and persisted (${facts2} facts)`);
  assert(read2.confidence === continued.confidence, `updated confidence persisted (${read2.confidence})`);
  assert(
    JSON.stringify(read2.knowledge_core) !== JSON.stringify(read1.knowledge_core),
    "second turn changed the stored Knowledge Core",
  );

  console.log(process.exitCode ? "\nPERSISTENCE TEST FAILED" : "\nPERSISTENCE TEST PASSED");
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
