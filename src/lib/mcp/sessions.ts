/**
 * Ephemeral, in-memory session state for the no-auth MCP MVP.
 *
 * Sessions are keyed by an opaque random id returned to the caller. They are
 * NOT durable: they live in the server runtime's memory only, expire after
 * SESSION_TTL_MS and are lost on redeploy or when the runtime recycles.
 * No ChatGPT account identity is available or used here. Durable per-user
 * persistence, subscription status and private analytics require account
 * linking / OAuth 2.1, which is not part of this MVP.
 */
import type { KnowledgeCore } from "../knowledge";
import { emptyCore } from "../knowledge";

export const SESSION_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const MAX_SESSIONS = 500;

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

const sessions = new Map<string, Session>();

function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  while (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.values()].sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (!oldest) break;
    sessions.delete(oldest.id);
  }
}

function opaqueId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `sess_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function createSession(): Session {
  sweep();
  const now = Date.now();
  const session: Session = {
    id: opaqueId(),
    createdAt: now,
    updatedAt: now,
    core: emptyCore(),
    transcript: [],
    confidence: 0,
    complete: false,
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  sweep();
  return sessions.get(id);
}

export function saveSession(session: Session) {
  session.updatedAt = Date.now();
  sessions.set(session.id, session);
}

export function sessionCount() {
  sweep();
  return sessions.size;
}

export const SESSION_NOTE =
  "Ephemeral demo session: state is held in server memory only, expires after ~6h and is not linked to any account. Durable persistence requires account linking (OAuth 2.1), which is not enabled in this MVP.";
