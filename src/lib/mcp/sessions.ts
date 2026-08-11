/**
 * Durable anonymous session state for the no-auth MCP server and the website.
 *
 * Sessions are keyed by a cryptographically strong opaque token (`sess_` +
 * 32 hex chars). The database primary key is a uuid that is never exposed.
 * Rows carry created/updated timestamps and an expiry used for retention.
 * No ChatGPT account identity is available or used here: a session is an
 * anonymous draft. Durable *ownership*, subscription status and private
 * analytics require account linking on the Crawler website.
 *
 * If the database is unreachable the store degrades to in-memory state so the
 * MCP endpoint keeps working (state is then lost on redeploy).
 */
import type { KnowledgeCore } from "../knowledge";
import { emptyCore } from "../knowledge";

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days retention

export type Transcript = { role: "user" | "assistant"; content: string }[];

export type Session = {
  id: string;
  createdAt: number;
  updatedAt: number;
  core: KnowledgeCore;
  transcript: Transcript;
  confidence: number;
  complete: boolean;
};

/* ------------------------------------------------------------------ */
/* Fallback store                                                      */
/* ------------------------------------------------------------------ */

const memory = new Map<string, Session>();
const MAX_MEMORY_SESSIONS = 500;

function rememberLocally(session: Session) {
  memory.set(session.id, session);
  while (memory.size > MAX_MEMORY_SESSIONS) {
    const oldest = [...memory.values()].sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (!oldest) break;
    memory.delete(oldest.id);
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function opaqueToken(prefix: string, bytes = 16) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return `${prefix}_${[...buf].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function client() {
  try {
    const { db } = await import("./db.server");
    return db();
  } catch {
    return null;
  }
}

type Row = {
  token: string;
  core: unknown;
  transcript: unknown;
  confidence: number;
  complete: boolean;
  created_at: string;
  updated_at: string;
};

function fromRow(row: Row): Session {
  return {
    id: row.token,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    core: (row.core as KnowledgeCore) ?? emptyCore(),
    transcript: Array.isArray(row.transcript) ? (row.transcript as Transcript) : [],
    confidence: row.confidence ?? 0,
    complete: Boolean(row.complete),
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function createSession(origin: "mcp" | "web" = "mcp"): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    id: opaqueToken("sess"),
    createdAt: now,
    updatedAt: now,
    core: emptyCore(),
    transcript: [],
    confidence: 0,
    complete: false,
  };

  const supabase = await client();
  if (supabase) {
    const { error } = await supabase.from("mcp_sessions").insert({
      token: session.id,
      core: session.core,
      transcript: [],
      confidence: 0,
      complete: false,
      origin,
      expires_at: new Date(now + SESSION_TTL_MS).toISOString(),
    });
    if (!error) return session;
  }
  rememberLocally(session);
  return session;
}

export async function getSession(id: string): Promise<Session | undefined> {
  if (typeof id !== "string" || id.length < 6 || id.length > 128) return undefined;
  const supabase = await client();
  if (supabase) {
    const { data } = await supabase
      .from("mcp_sessions")
      .select("token, core, transcript, confidence, complete, created_at, updated_at")
      .eq("token", id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (data) return fromRow(data as Row);
  }
  return memory.get(id);
}

export async function saveSession(session: Session): Promise<void> {
  session.updatedAt = Date.now();
  const supabase = await client();
  if (supabase) {
    const { error } = await supabase
      .from("mcp_sessions")
      .update({
        core: session.core,
        transcript: session.transcript,
        confidence: session.confidence,
        complete: session.complete,
        expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      })
      .eq("token", session.id);
    if (!error) return;
  }
  rememberLocally(session);
}

export async function sessionCount(): Promise<number> {
  const supabase = await client();
  if (supabase) {
    const { count } = await supabase
      .from("mcp_sessions")
      .select("id", { count: "exact", head: true })
      .gt("expires_at", new Date().toISOString());
    if (typeof count === "number") return count;
  }
  return memory.size;
}

export async function storeMode(): Promise<"database" | "in-memory-fallback"> {
  return (await client()) ? "database" : "in-memory-fallback";
}

export const SESSION_NOTE =
  "Anonymous draft session: identified only by an opaque random token, stored for ~30 days and not linked to any account. Anyone holding the token can read the draft, so treat it as a shareable link. Durable ownership, paid plans and private analytics require account linking on the Crawler website.";
