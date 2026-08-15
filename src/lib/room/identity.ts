/**
 * Pseudonymous identity derived from MCP request metadata.
 *
 * SECURITY:
 * - `openai/subject` is NEVER accepted as a tool input from the model.
 * - The raw subject value is never stored; only HMAC-SHA256(secret, subject).
 * - Missing subject => IDENTITY_UNAVAILABLE (never a random fallback identity).
 */
import { roomSubjectSecret } from "./config";
import { hmacSha256Hex } from "./crypto";
import { roomError } from "./errors";

export type McpMeta = Record<string, unknown> | undefined;

export interface Identity {
  subjectHash: string;
  sessionHash: string | null;
  locale: string | null;
}

function readMetaString(meta: McpMeta, key: string): string | null {
  if (!meta) return null;
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readSubject(meta: McpMeta): string | null {
  // Crawler passes an explicit opaque `room_token` (no accounts, no ChatGPT identity).
  return readMetaString(meta, "room/token") ?? readMetaString(meta, "openai/subject");
}

export async function resolveIdentity(meta: McpMeta): Promise<Identity> {
  const secret = roomSubjectSecret();

  // Server-side recovery of a known identity (session -> existing profile).
  // Never accepted from the model: only Crawler's own code sets this key.
  const direct = readMetaString(meta, "room/subject_hash");
  const session = readMetaString(meta, "room/session") ?? readMetaString(meta, "openai/session");
  if (direct && /^[0-9a-f]{64}$/i.test(direct)) {
    return {
      subjectHash: direct.toLowerCase(),
      sessionHash: session ? await hmacSha256Hex(secret, session) : null,
      locale: readMetaString(meta, "openai/locale"),
    };
  }

  const subject = readSubject(meta);
  if (!subject) throw roomError("IDENTITY_UNAVAILABLE");

  const subjectHash = await hmacSha256Hex(secret, subject);

  const sessionHash = session ? await hmacSha256Hex(secret, session) : null;


  return {
    subjectHash,
    sessionHash,
    locale: readMetaString(meta, "openai/locale"),
  };
}
