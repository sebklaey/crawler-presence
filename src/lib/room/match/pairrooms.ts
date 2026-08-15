/**
 * Public Pair Rooms.
 *
 * A pair room is a public two-person room: everyone can read it, only the two
 * matched handles may post. There are no private rooms in Crawler Room.
 */
import { config } from "../config";
import { randomId } from "../crypto";
import { roomError } from "../errors";
import { getOwnProfile } from "../profile";
import { enforceRateLimit, WINDOWS } from "../ratelimit";
import type { Db } from "../store";

export interface PairRoom {
  id: string;
  public_slug: string;
  title: string;
  created_at: string;
}

export interface Participant {
  subject_hash: string;
  public_handle: string;
  can_write: boolean;
}

export function pairRoomUrl(slug: string): string {
  return `https://crawler.today/rooms/${slug}`;
}

async function handleFor(db: Db, subjectHash: string): Promise<string> {
  const profile = await getOwnProfile(db, subjectHash);
  return String((profile as any).handle ?? "anon");
}

/** Creates the public pair room and authorises exactly two writers. */
export async function createPairRoom(
  db: Db,
  a: string,
  b: string,
  matchPublicId: string,
): Promise<{ room: PairRoom; participants: Participant[] }> {
  const [handleA, handleB] = await Promise.all([handleFor(db, a), handleFor(db, b)]);
  const slug = `pair-${randomId(6)}`;

  const { data: room, error } = await db
    .from("rooms")
    .insert({
      topic_id: null,
      room_number: 1,
      capacity: 2,
      kind: "pair",
      visibility: "public",
      public_slug: slug,
      title: "Public Match Room",
      description: `Public two-person room · match ${matchPublicId}`,
      retention_hours: 24,
    })
    .select("id, public_slug, title, created_at")
    .single();
  if (error || !room) throw roomError("INTERNAL_ERROR");

  const participants: Participant[] = [
    { subject_hash: a, public_handle: handleA, can_write: true },
    { subject_hash: b, public_handle: handleB, can_write: true },
  ];

  const { error: partError } = await db.from("room_participants").insert(
    participants.map((p) => ({
      room_id: (room as any).id,
      subject_hash: p.subject_hash,
      public_handle: p.public_handle,
      role: "pair_participant",
      can_write: true,
    })),
  );
  if (partError) throw roomError("INTERNAL_ERROR");

  const { error: memberError } = await db.from("memberships").insert(
    participants.map((p) => ({
      topic_id: null,
      room_id: (room as any).id,
      subject_hash: p.subject_hash,
      alias: `@${p.public_handle}`,
    })),
  );
  if (memberError) throw roomError("INTERNAL_ERROR");

  return { room: room as PairRoom, participants };
}

export async function loadPairRoom(db: Db, slug: string): Promise<PairRoom | null> {
  const { data } = await db
    .from("rooms")
    .select("id, public_slug, title, created_at")
    .eq("public_slug", slug)
    .eq("kind", "pair")
    .maybeSingle();
  return (data as PairRoom | null) ?? null;
}

export async function listParticipants(db: Db, roomId: string): Promise<Participant[]> {
  const { data } = await db
    .from("room_participants")
    .select("subject_hash, public_handle, can_write")
    .eq("room_id", roomId)
    .is("left_at", null);
  return ((data ?? []) as any[]).map((row) => ({
    subject_hash: row.subject_hash,
    public_handle: row.public_handle ?? "anon",
    can_write: Boolean(row.can_write),
  }));
}

export interface PairMessage {
  handle: string;
  body: string;
  created_at: string;
}

/** Public read — no identity required. */
export async function readPairMessages(db: Db, roomId: string, limit = 50): Promise<PairMessage[]> {
  const { data } = await db
    .from("messages")
    .select("body, created_at, memberships(alias)")
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  return ((data ?? []) as any[]).map((row) => ({
    handle: String(row.memberships?.alias ?? "@anon").replace(/^@+/, ""),
    body: String(row.body),
    created_at: String(row.created_at),
  }));
}

/** Only the two matched participants may post. */
export async function sendPairMessage(
  db: Db,
  roomId: string,
  subjectHash: string,
  body: string,
): Promise<PairMessage> {
  const cfg = config();
  const text = String(body ?? "").trim();
  if (!text) throw roomError("MESSAGE_EMPTY");
  if (text.length > cfg.maxMessageLength) throw roomError("MESSAGE_TOO_LONG");

  const { data: participant } = await db
    .from("room_participants")
    .select("can_write, public_handle")
    .eq("room_id", roomId)
    .eq("subject_hash", subjectHash)
    .is("left_at", null)
    .maybeSingle();
  if (!participant || !(participant as any).can_write) throw roomError("FORBIDDEN");

  await enforceRateLimit(
    db,
    subjectHash,
    "message",
    WINDOWS.message(cfg.rateLimitPerMinute, cfg.rateLimitPerHour),
  );

  const { data: membership } = await db
    .from("memberships")
    .select("id")
    .eq("room_id", roomId)
    .eq("subject_hash", subjectHash)
    .is("left_at", null)
    .maybeSingle();
  if (!membership) throw roomError("FORBIDDEN");

  const { data, error } = await db
    .from("messages")
    .insert({
      room_id: roomId,
      membership_id: (membership as any).id,
      body: text,
      expires_at: new Date(Date.now() + cfg.messageRetentionHours * 3600_000).toISOString(),
    })
    .select("body, created_at")
    .single();
  if (error || !data) throw roomError("INTERNAL_ERROR");

  return {
    handle: String((participant as any).public_handle ?? "anon"),
    body: String((data as any).body),
    created_at: String((data as any).created_at),
  };
}

/** Ends the conversation: the room stays publicly readable, writing stops. */
export async function closePairRoom(db: Db, roomId: string, subjectHash: string) {
  const participants = await listParticipants(db, roomId);
  if (!participants.some((p) => p.subject_hash === subjectHash)) throw roomError("FORBIDDEN");
  await db.from("room_participants").update({ can_write: false }).eq("room_id", roomId);
  await db.from("rooms").update({ status: "closed" }).eq("id", roomId);
  return true;
}
