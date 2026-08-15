/**
 * MCP handlers for Crawler Match (Pro extension).
 *
 * Identity always comes from the pseudonymous room token in `_meta`; the model
 * never supplies it. Plans are resolved server-side.
 */
import { requireSecret } from "../config";
import { requireEntitlement, resolveEntitlements } from "../entitlements";
import { roomError } from "../errors";
import { resolveIdentity, type McpMeta } from "../identity";
import { getDb, touchPresence, type Db } from "../store";
import { MIN_RESONANCE, resonanceLabel } from "./config";
import {
  closePairRoom,
  listParticipants,
  loadPairRoom,
  pairRoomUrl,
  readPairMessages,
  sendPairMessage,
} from "./pairrooms";
import {
  createPattern,
  deletePattern,
  getActivePattern,
  publicPattern,
  updatePattern,
  validatePatternInput,
} from "./patterns";
import { findMatch, matchStatus, respondToMatch } from "./service";

export const MATCH_NOTICE =
  "Crawler Match ist anonym: keine Profiltexte, keine Chatverläufe, nur abstrakte Schwingungsmuster. Entstehende Pair Rooms sind öffentlich lesbar; nur die zwei gematchten Handles dürfen schreiben.";

async function proContext(meta: McpMeta): Promise<{ db: Db; subjectHash: string }> {
  const identity = await resolveIdentity(meta);
  const db = await getDb();
  await touchPresence(db, identity.subjectHash);
  const ctx = await resolveEntitlements(db, identity.subjectHash);
  requireEntitlement(ctx, "match");
  return { db, subjectHash: identity.subjectHash };
}

function signatureSalt(): string {
  return requireSecret("SUBJECT_HASH_SECRET");
}

export async function handleCreateResonancePattern(input: unknown, meta: McpMeta) {
  const { db, subjectHash } = await proContext(meta);
  const parsed = validatePatternInput(input);
  const row = await createPattern(db, subjectHash, parsed, signatureSalt());
  return {
    pattern: publicPattern(row),
    notice: MATCH_NOTICE,
    message:
      "Schwingungsmuster erstellt. Mit find_match suche ich genau eine kompatible Resonanz — verbunden wird nur bei beidseitiger Zustimmung.",
  };
}

export async function handleUpdateResonancePattern(input: unknown, meta: McpMeta) {
  const { db, subjectHash } = await proContext(meta);
  const parsed = validatePatternInput(input);
  const row = await updatePattern(db, subjectHash, parsed, signatureSalt());
  return { pattern: publicPattern(row), message: "Schwingungsmuster aktualisiert." };
}

export async function handleDeleteResonancePattern(_input: unknown, meta: McpMeta) {
  const { db, subjectHash } = await proContext(meta);
  const removed = await deletePattern(db, subjectHash);
  return {
    deleted: removed,
    message: removed
      ? "Dein Schwingungsmuster und alle offenen Match-Vorschläge wurden unwiderruflich gelöscht."
      : "Es war kein Schwingungsmuster gespeichert.",
  };
}

export async function handleFindMatch(_input: unknown, meta: McpMeta) {
  const { db, subjectHash } = await proContext(meta);
  const result = await findMatch(db, subjectHash);

  if (result.status === "no_pattern") {
    return {
      status: result.status,
      message: "Du hast noch kein Schwingungsmuster. Erstelle es zuerst mit create_resonance_pattern.",
    };
  }
  if (result.status === "no_candidate") {
    return {
      status: result.status,
      message: `Aktuell gibt es keine ausreichend kompatible Resonanz (mindestens ${MIN_RESONANCE}%). Versuche es später wieder — dein Muster bleibt aktiv.`,
    };
  }
  const match = result.match!;
  return {
    status: result.status,
    match,
    message: `${resonanceLabel(match.resonance)} (${match.resonance}%): ${match.reasons.join(" · ")}. Mit respond_to_match kannst du zustimmen, ablehnen oder blockieren. Es wird nichts verbunden, solange nicht beide zustimmen.`,
  };
}

export async function handleGetMatchStatus(_input: unknown, meta: McpMeta) {
  const { db, subjectHash } = await proContext(meta);
  const result = await matchStatus(db, subjectHash);
  if (result.status === "no_pattern") {
    return { status: result.status, matches: [], message: "Noch kein Schwingungsmuster vorhanden." };
  }
  const pattern = await getActivePattern(db, subjectHash);
  return {
    status: "ok",
    pattern: pattern ? publicPattern(pattern) : null,
    matches: result.matches,
    message: result.matches.length
      ? `${result.matches.length} offene(r) Match-Vorgang.`
      : "Keine offenen Match-Vorgänge.",
  };
}

export async function handleRespondToMatch(input: unknown, meta: McpMeta) {
  const { db, subjectHash } = await proContext(meta);
  const data = (input ?? {}) as Record<string, unknown>;
  const matchId = String(data["public_match_id"] ?? "").trim();
  const decision = String(data["decision"] ?? "").trim();
  if (!matchId) throw roomError("INVALID_INPUT", "public_match_id fehlt.");
  if (!["accept", "decline", "block"].includes(decision)) {
    throw roomError("INVALID_INPUT", "decision muss accept, decline oder block sein.");
  }
  const result = await respondToMatch(db, subjectHash, matchId, decision as "accept" | "decline" | "block");
  return { ...result, notice: result.room_url ? MATCH_NOTICE : undefined };
}

/* --------------------------- public pair rooms --------------------------- */

function slugFrom(input: unknown): string {
  const data = (input ?? {}) as Record<string, unknown>;
  const raw = String(data["room_slug"] ?? data["room_url"] ?? "").trim();
  const slug = raw.split("/").filter(Boolean).pop() ?? "";
  if (!slug) throw roomError("INVALID_INPUT", "room_slug fehlt.");
  return slug;
}

/** Public read — no plan and no identity required. */
export async function handleOpenPairRoom(input: unknown, _meta: McpMeta) {
  const db = await getDb();
  const slug = slugFrom(input);
  const room = await loadPairRoom(db, slug);
  if (!room) throw roomError("NOT_FOUND");

  const [participants, messages] = await Promise.all([
    listParticipants(db, room.id),
    readPairMessages(db, room.id),
  ]);

  const handles = participants.map((p) => `@${p.public_handle}`);
  return {
    room_slug: room.public_slug,
    room_url: pairRoomUrl(room.public_slug),
    title: room.title,
    participants: handles,
    messages: messages.map((m) => ({ handle: `@${m.handle}`, body: m.body, created_at: m.created_at })),
    notice: `Public Match Room. Everyone can read this conversation. Only ${handles.join(" and ")} can post.`,
  };
}

export async function handleSendPairMessage(input: unknown, meta: McpMeta) {
  const identity = await resolveIdentity(meta);
  const db = await getDb();
  const slug = slugFrom(input);
  const room = await loadPairRoom(db, slug);
  if (!room) throw roomError("NOT_FOUND");

  const body = String(((input ?? {}) as Record<string, unknown>)["message"] ?? "");
  const sent = await sendPairMessage(db, room.id, identity.subjectHash, body);
  return {
    room_url: pairRoomUrl(room.public_slug),
    message_sent: sent,
    notice: "Public Match Room. Everyone can read this conversation.",
  };
}

export async function handleClosePairRoom(input: unknown, meta: McpMeta) {
  const identity = await resolveIdentity(meta);
  const db = await getDb();
  const slug = slugFrom(input);
  const room = await loadPairRoom(db, slug);
  if (!room) throw roomError("NOT_FOUND");
  await closePairRoom(db, room.id, identity.subjectHash);
  return {
    room_url: pairRoomUrl(room.public_slug),
    message: "Der Pair Room ist geschlossen. Er bleibt öffentlich lesbar, es kann aber niemand mehr schreiben.",
  };
}
