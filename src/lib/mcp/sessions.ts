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
 * Persistence contract: a session row is written with a single verified
 * upsert of the *complete* state (see `saveSession`). The row is only created
 * on the first save, so a half-written empty row can never survive a failed
 * turn. When the database is configured but a write fails we throw instead of
 * silently reporting success; the in-memory map is only used when no database
 * is configured at all (state is then lost on redeploy).
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
  origin: "mcp" | "web";
};

export class SessionPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionPersistenceError";
  }
}

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
  origin?: string;
  created_at: string;
  updated_at: string;
};

/** The database column is an integer, the model works in 0-1 confidence. */
function confidenceToDb(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v * 100)));
}

function confidenceFromDb(v: number | null | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v / 100));
}

function fromRow(row: Row): Session {
  return {
    id: row.token,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    core: (row.core as KnowledgeCore) ?? emptyCore(),
    transcript: Array.isArray(row.transcript) ? (row.transcript as Transcript) : [],
    confidence: confidenceFromDb(row.confidence),
    complete: Boolean(row.complete),
    origin: row.origin === "web" ? "web" : "mcp",
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function createSession(origin: "mcp" | "web" = "mcp"): Session {
  const now = Date.now();
  // Not written to the database yet: the row is created by the first
  // saveSession() upsert, so an interview turn that fails never leaves an
  // empty, unusable session row behind.
  return {
    id: opaqueToken("sess"),
    createdAt: now,
    updatedAt: now,
    core: emptyCore(),
    transcript: [],
    confidence: 0,
    complete: false,
    origin,
  };
}

export async function getSession(id: string): Promise<Session | undefined> {
  if (typeof id !== "string" || id.length < 6 || id.length > 128) return undefined;
  const supabase = await client();
  if (supabase) {
    const { data } = await supabase
      .from("mcp_sessions")
      .select("token, core, transcript, confidence, complete, origin, created_at, updated_at")
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
  if (!supabase) {
    // No database configured at all — degrade to in-memory state.
    rememberLocally(session);
    return;
  }

  const now = new Date();
  const { data, error } = await supabase
    .from("mcp_sessions")
    .upsert(
      {
        token: session.id,
        core: session.core,
        transcript: session.transcript,
        confidence: confidenceToDb(session.confidence),
        complete: session.complete,
        origin: session.origin,
        updated_at: now.toISOString(),
        expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      },
      { onConflict: "token" },
    )
    .select("token")
    .maybeSingle();

  if (error || !data) {
    const detail = error?.message ?? "no row returned by the upsert";
    console.error("[crawler] session persistence failed", { session_id: session.id, detail });
    throw new SessionPersistenceError(
      `Could not save session state to the Crawler database (${detail}). Nothing was lost on your side — please retry the last step.`,
    );
  }
  // Keep a warm copy for same-worker reads; the database stays the source of truth.
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
  "Anonymous draft session: identified only by an opaque random token, stored durably for ~30 days and not linked to any account. Anyone holding the token can read the draft, so treat it as a shareable link. Durable ownership, paid plans and private analytics require account linking on the Crawler website.";
