/**
 * Room chat backend for the public Crawler MCP endpoint.
 *
 * Rooms are small (max 5 people), anonymous and ephemeral: messages expire
 * after 24 hours. There is no account and no ChatGPT identity — a caller is
 * identified purely by an opaque, high-entropy `room_token` that the client
 * receives once from `room_enter_topic` and sends back on later calls.
 * Only the SHA-256 hash of that token is stored (`subject_hash`).
 */
import { db } from "../mcp/db.server";

export const MAX_MESSAGE_LENGTH = 500;
export const MAX_LINKS_PER_MESSAGE = 2;
export const PRESENCE_WINDOW_SECONDS = 180;
export const MAX_ALIAS_LENGTH = 32;

export class RoomError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RoomError";
    this.code = code;
  }
}

const ERRORS: Record<string, string> = {
  BACKEND_UNAVAILABLE: "The room service is temporarily unavailable. Please try again later.",
  TOPIC_NOT_FOUND: "I do not know this topic. Call room_list_topics to see the available topics.",
  NOT_A_MEMBER: "You are currently not in a room for this topic. Use room_enter_topic first.",
  IDENTITY_REQUIRED: "A room_token is required. Call room_enter_topic first and reuse the token it returns.",
  MESSAGE_EMPTY: "Your message is empty.",
  MESSAGE_TOO_LONG: `Your message is too long. At most ${MAX_MESSAGE_LENGTH} characters are allowed.`,
  TOO_MANY_LINKS: "Your message contains too many links. At most two are allowed.",
  MESSAGE_NOT_FOUND: "This message is no longer available.",
  ALIAS_TAKEN: "This display name is already taken. Please choose another one.",
  INVALID_INPUT: "The provided input was incomplete or invalid.",
  RATE_LIMITED: "You were very active just now. Please try again in a minute.",
  ROOM_UNAVAILABLE: "Your room is currently unavailable. Please try again.",
  INTERNAL_ERROR: "Something went wrong. Please try again later.",
};

export function roomError(code: keyof typeof ERRORS | string, message?: string): RoomError {
  return new RoomError(code, message ?? ERRORS[code] ?? ERRORS["INTERNAL_ERROR"]!);
}

function client() {
  const supabase = db();
  if (!supabase) throw roomError("BACKEND_UNAVAILABLE");
  return supabase;
}

/* ------------------------------ identity ------------------------------ */

export function newRoomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `room_${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function subjectHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Resolves the caller: reuses an existing token or mints a fresh identity. */
export async function resolveIdentity(
  token: string | undefined,
  allowCreate: boolean,
): Promise<{ token: string; hash: string; created: boolean }> {
  const trimmed = typeof token === "string" ? token.trim() : "";
  if (!trimmed) {
    if (!allowCreate) throw roomError("IDENTITY_REQUIRED");
    const fresh = newRoomToken();
    const hash = await subjectHash(fresh);
    await client().from("room_identities").upsert({ subject_hash: hash }, { onConflict: "subject_hash" });
    return { token: fresh, hash, created: true };
  }
  const hash = await subjectHash(trimmed);
  await client()
    .from("room_identities")
    .upsert({ subject_hash: hash, last_seen_at: new Date().toISOString() }, { onConflict: "subject_hash" });
  return { token: trimmed, hash, created: false };
}

/* -------------------------------- alias -------------------------------- */

const ADJECTIVES = ["Blue", "Quiet", "Green", "Silver", "Warm", "Bright", "Calm", "Golden", "Soft", "Clever", "Amber", "Swift", "Gentle", "Violet", "Sunny", "Copper"];
const ANIMALS = ["Lynx", "Fox", "Owl", "Panda", "Otter", "Heron", "Falcon", "Deer", "Badger", "Raven", "Seal", "Ibex", "Marten", "Crane", "Hare", "Bison"];

export function sanitizeAlias(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .normalize("NFKC")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N} \-'.]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return Array.from(cleaned).slice(0, MAX_ALIAS_LENGTH).join("").trim() || null;
}

export function generateAlias(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const adjective = ADJECTIVES[hash % ADJECTIVES.length]!;
  const animal = ANIMALS[Math.floor(hash / ADJECTIVES.length) % ANIMALS.length]!;
  return `${adjective} ${animal}`;
}

export async function getCustomAlias(hash: string): Promise<string | null> {
  const { data } = await client()
    .from("room_identities")
    .select("custom_alias")
    .eq("subject_hash", hash)
    .maybeSingle();
  return ((data as { custom_alias?: string | null } | null)?.custom_alias ?? null) || null;
}

export async function setCustomAlias(hash: string, alias: string): Promise<{ alias: string; rooms_updated: number }> {
  const supabase = client();
  const { data: taken } = await supabase
    .from("room_identities")
    .select("subject_hash")
    .ilike("custom_alias", alias.replace(/[%_]/g, "\\$&"))
    .limit(5);
  if (((taken ?? []) as Array<{ subject_hash: string }>).some((row) => row.subject_hash !== hash)) {
    throw roomError("ALIAS_TAKEN");
  }
  const { error } = await supabase
    .from("room_identities")
    .upsert({ subject_hash: hash, custom_alias: alias }, { onConflict: "subject_hash" });
  if (error) throw roomError("INTERNAL_ERROR");
  const { data: updated } = await supabase
    .from("room_memberships")
    .update({ alias })
    .eq("subject_hash", hash)
    .is("left_at", null)
    .select("id");
  return { alias, rooms_updated: ((updated ?? []) as unknown[]).length };
}

/* ----------------------------- rate limits ----------------------------- */

interface Window { seconds: number; max: number }

export async function enforceRateLimit(hash: string, action: string, windows: Window[]): Promise<void> {
  const supabase = client();
  const now = Date.now();
  const oldest = Math.max(...windows.map((w) => w.seconds));
  const { data } = await supabase
    .from("room_rate_events")
    .select("created_at")
    .eq("subject_hash", hash)
    .eq("action", action)
    .gte("created_at", new Date(now - oldest * 1000).toISOString());
  const stamps = ((data ?? []) as Array<{ created_at: string }>).map((r) => new Date(r.created_at).getTime());
  for (const window of windows) {
    const threshold = now - window.seconds * 1000;
    if (stamps.filter((t) => t >= threshold).length >= window.max) throw roomError("RATE_LIMITED");
  }
  await supabase.from("room_rate_events").insert({ subject_hash: hash, action });
}

/* -------------------------------- topics ------------------------------- */

export interface TopicRow { id: string; slug: string; display_name: string; description: string | null }

export async function listTopics(): Promise<Array<TopicRow & { active_rooms: number; members_online: number }>> {
  const supabase = client();
  const { data } = await supabase
    .from("room_topics")
    .select("id, slug, display_name, description")
    .eq("enabled", true)
    .order("display_name");
  const topics = (data ?? []) as TopicRow[];
  const since = new Date(Date.now() - PRESENCE_WINDOW_SECONDS * 1000).toISOString();
  const { data: members } = await supabase
    .from("room_memberships")
    .select("topic_id, room_id, last_seen_at")
    .is("left_at", null);
  const rows = (members ?? []) as Array<{ topic_id: string; room_id: string; last_seen_at: string }>;
  return topics.map((topic) => {
    const mine = rows.filter((r) => r.topic_id === topic.id);
    return {
      ...topic,
      active_rooms: new Set(mine.map((r) => r.room_id)).size,
      members_online: mine.filter((r) => r.last_seen_at >= since).length,
    };
  });
}

/** Maps free text ("KI", "Kunst", "tech") onto a topic slug. */
export async function resolveTopicSlug(input: string): Promise<string> {
  const needle = input.normalize("NFKC").trim().toLowerCase();
  if (!needle) throw roomError("INVALID_INPUT");
  const supabase = client();
  const { data: direct } = await supabase
    .from("room_topics")
    .select("slug")
    .eq("enabled", true)
    .ilike("slug", needle)
    .maybeSingle();
  if (direct) return (direct as { slug: string }).slug;

  const { data: byName } = await supabase
    .from("room_topics")
    .select("slug")
    .eq("enabled", true)
    .ilike("display_name", needle)
    .maybeSingle();
  if (byName) return (byName as { slug: string }).slug;

  const { data: alias } = await supabase
    .from("room_topic_aliases")
    .select("topic_id")
    .eq("normalized_alias", needle)
    .maybeSingle();
  if (alias) {
    const { data: topic } = await supabase
      .from("room_topics")
      .select("slug")
      .eq("id", (alias as { topic_id: string }).topic_id)
      .maybeSingle();
    if (topic) return (topic as { slug: string }).slug;
  }
  throw roomError("TOPIC_NOT_FOUND");
}

/* ------------------------------ membership ----------------------------- */

export interface JoinResult {
  topic_slug: string;
  topic_display_name: string;
  room_id: string;
  room_number: number;
  capacity: number;
  member_count: number;
  membership_id: string;
  alias: string;
  joined_at: string;
  last_read_message_id: number | null;
  joined_now: boolean;
}

export async function joinTopic(hash: string, topicSlug: string, alias: string): Promise<JoinResult> {
  const { data, error } = await client().rpc("room_join_topic", {
    p_subject_hash: hash,
    p_topic_slug: topicSlug,
    p_alias: alias,
  });
  if (error) throw roomError("ROOM_UNAVAILABLE");
  const result = data as JoinResult & { error?: string };
  if (result?.error) throw roomError(result.error);
  return result;
}

export async function activeMembership(hash: string, topicSlug?: string) {
  const supabase = client();
  let query = supabase
    .from("room_memberships")
    .select("id, topic_id, room_id, alias, last_read_message_id, joined_at")
    .eq("subject_hash", hash)
    .is("left_at", null);
  if (topicSlug) {
    const { data: topic } = await supabase
      .from("room_topics")
      .select("id")
      .eq("slug", topicSlug)
      .maybeSingle();
    if (!topic) throw roomError("TOPIC_NOT_FOUND");
    query = query.eq("topic_id", (topic as { id: string }).id);
  }
  const { data } = await query.order("joined_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) throw roomError("NOT_A_MEMBER");
  return data as {
    id: string; topic_id: string; room_id: string; alias: string;
    last_read_message_id: number | null; joined_at: string;
  };
}

export async function touchPresence(hash: string): Promise<void> {
  await client()
    .from("room_memberships")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("subject_hash", hash)
    .is("left_at", null);
}

export async function countOnline(roomId: string): Promise<number> {
  const since = new Date(Date.now() - PRESENCE_WINDOW_SECONDS * 1000).toISOString();
  const { count } = await client()
    .from("room_memberships")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .is("left_at", null)
    .gte("last_seen_at", since);
  return count ?? 0;
}

export async function myRooms(hash: string) {
  const supabase = client();
  const { data } = await supabase
    .from("room_memberships")
    .select("id, topic_id, room_id, alias, joined_at, last_read_message_id")
    .eq("subject_hash", hash)
    .is("left_at", null);
  const memberships = (data ?? []) as Array<{
    id: string; topic_id: string; room_id: string; alias: string;
    joined_at: string; last_read_message_id: number | null;
  }>;
  if (memberships.length === 0) return [];

  const { data: topics } = await supabase
    .from("room_topics")
    .select("id, slug, display_name")
    .in("id", memberships.map((m) => m.topic_id));
  const { data: rooms } = await supabase
    .from("room_rooms")
    .select("id, room_number, capacity")
    .in("id", memberships.map((m) => m.room_id));

  const topicById = new Map(((topics ?? []) as Array<{ id: string; slug: string; display_name: string }>).map((t) => [t.id, t]));
  const roomById = new Map(((rooms ?? []) as Array<{ id: string; room_number: number; capacity: number }>).map((r) => [r.id, r]));

  return Promise.all(
    memberships.map(async (membership) => {
      const topic = topicById.get(membership.topic_id);
      const room = roomById.get(membership.room_id);
      const { count: unread } = await supabase
        .from("room_messages")
        .select("id", { count: "exact", head: true })
        .eq("room_id", membership.room_id)
        .gt("id", membership.last_read_message_id ?? 0);
      return {
        topic_slug: topic?.slug ?? "",
        topic_display_name: topic?.display_name ?? "",
        room_number: room?.room_number ?? 0,
        capacity: room?.capacity ?? 5,
        alias: membership.alias,
        joined_at: membership.joined_at,
        members_online: await countOnline(membership.room_id),
        unread_messages: unread ?? 0,
      };
    }),
  );
}

export async function leaveTopic(hash: string, topicSlug: string) {
  const membership = await activeMembership(hash, topicSlug);
  const { error } = await client()
    .from("room_memberships")
    .update({ left_at: new Date().toISOString() })
    .eq("id", membership.id);
  if (error) throw roomError("INTERNAL_ERROR");
  return { topic_slug: topicSlug, left: true };
}

/* ------------------------------- messages ------------------------------ */

export function validateMessageBody(raw: string): string {
  const body = typeof raw === "string" ? raw.replace(/\s+$/g, "").trim() : "";
  if (!body) throw roomError("MESSAGE_EMPTY");
  if (Array.from(body).length > MAX_MESSAGE_LENGTH) throw roomError("MESSAGE_TOO_LONG");
  const links = body.match(/https?:\/\/\S+/gi) ?? [];
  if (links.length > MAX_LINKS_PER_MESSAGE) throw roomError("TOO_MANY_LINKS");
  return body;
}

export async function sendMessage(hash: string, topicSlug: string, rawBody: string) {
  const body = validateMessageBody(rawBody);
  const membership = await activeMembership(hash, topicSlug);
  await enforceRateLimit(hash, "message", [
    { seconds: 60, max: 12 },
    { seconds: 3600, max: 200 },
  ]);
  const supabase = client();
  const { data, error } = await supabase
    .from("room_messages")
    .insert({ room_id: membership.room_id, membership_id: membership.id, body })
    .select("id, created_at, expires_at")
    .maybeSingle();
  if (error || !data) throw roomError("INTERNAL_ERROR");
  const row = data as { id: number; created_at: string; expires_at: string };
  await supabase
    .from("room_memberships")
    .update({ last_read_message_id: row.id, last_seen_at: new Date().toISOString() })
    .eq("id", membership.id);
  return {
    message_id: row.id,
    topic_slug: topicSlug,
    alias: membership.alias,
    created_at: row.created_at,
    expires_at: row.expires_at,
    members_online: await countOnline(membership.room_id),
  };
}

export async function readMessages(hash: string, topicSlug: string, limit: number, sinceId?: number) {
  const membership = await activeMembership(hash, topicSlug);
  const supabase = client();
  let query = supabase
    .from("room_messages")
    .select("id, body, created_at, membership_id")
    .eq("room_id", membership.room_id)
    .order("id", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (typeof sinceId === "number") query = query.gt("id", sinceId);
  const { data } = await query;
  const rows = ((data ?? []) as Array<{ id: number; body: string; created_at: string; membership_id: string }>).reverse();

  const { data: members } = await supabase
    .from("room_memberships")
    .select("id, alias")
    .eq("room_id", membership.room_id);
  const aliasById = new Map(((members ?? []) as Array<{ id: string; alias: string }>).map((m) => [m.id, m.alias]));

  const newest = rows.length > 0 ? rows[rows.length - 1]!.id : membership.last_read_message_id;
  if (newest) {
    await supabase
      .from("room_memberships")
      .update({ last_read_message_id: newest, last_seen_at: new Date().toISOString() })
      .eq("id", membership.id);
  }
  return {
    topic_slug: topicSlug,
    your_alias: membership.alias,
    members_online: await countOnline(membership.room_id),
    messages: rows.map((row) => ({
      message_id: row.id,
      alias: aliasById.get(row.membership_id) ?? "Former participant",
      is_you: row.membership_id === membership.id,
      body: row.body,
      created_at: row.created_at,
    })),
  };
}

export async function reportMessage(hash: string, messageId: number, reason: string, note?: string) {
  const supabase = client();
  const { data: message } = await supabase
    .from("room_messages")
    .select("id, room_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!message) throw roomError("MESSAGE_NOT_FOUND");
  const { data: membership } = await supabase
    .from("room_memberships")
    .select("id")
    .eq("subject_hash", hash)
    .eq("room_id", (message as { room_id: string }).room_id)
    .is("left_at", null)
    .maybeSingle();
  if (!membership) throw roomError("NOT_A_MEMBER");
  await enforceRateLimit(hash, "report", [{ seconds: 3600, max: 20 }]);
  await supabase.from("room_message_reports").upsert(
    {
      message_id: messageId,
      reporter_membership_id: (membership as { id: string }).id,
      reason,
    },
    { onConflict: "message_id,reporter_membership_id" },
  );
  return { reported: true, message_id: messageId, reason, note_recorded: false, note_hint: note ? "Notes are not stored." : undefined };
}
