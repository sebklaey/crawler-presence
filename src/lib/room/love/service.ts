/**
 * Crawler Love — server-side data layer.
 *
 * Everything here is keyed on the existing pseudonymous `subject_hash`. No
 * session ids and no recovery codes are ever stored in the love_* tables.
 * The Love vector is only ever decrypted inside this module (the Love matching
 * service) and never returned to a caller.
 */
import { randomId } from "../crypto";
import { roomError } from "../errors";
import type { Db } from "../store";
import {
  LOVE_CONSENT_VERSION,
  LOVE_VECTOR_VERSION,
  loveConfig,
  loveResonanceLabel,
  type AdultStatus,
} from "./config";
import { decryptValue, encryptValue, integrityHash } from "./crypto";
import { buildLoveVector, humanReadableSummary, scoreLoveVectors, type LoveVector } from "./vector";
import type { LoveAnswers } from "./interview";

/* ---------------------------------- types --------------------------------- */

export interface LoveDraft {
  id: string;
  subjectHash: string;
  currentQuestion: string | null;
  answers: LoveAnswers;
  progress: number;
  adultStatus: AdultStatus;
  expiresAt: string;
}

export interface LoveProfile {
  id: string;
  subjectHash: string;
  status: "draft" | "active" | "paused" | "deleted";
  relationshipIntention: string | null;
  preferredLanguages: string[];
  summary: string;
  vector: LoveVector | null;
  vectorVersion: number;
  loveEnabled: boolean;
  loveDiscoverable: boolean;
  allowRequests: boolean;
  publicPairRoomConsent: boolean;
  adultStatus: AdultStatus;
  activatedAt: string | null;
  pausedAt: string | null;
  suspendedAt: string | null;
  updatedAt: string;
}

/* --------------------------------- drafts --------------------------------- */

export async function loadDraft(db: Db, subjectHash: string): Promise<LoveDraft | null> {
  const { data } = await db
    .from("love_interview_drafts")
    .select("*")
    .eq("subject_hash", subjectHash)
    .maybeSingle();
  const row = data as any;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.from("love_interview_drafts").delete().eq("id", row.id);
    return null;
  }
  const answers = (await decryptValue<LoveAnswers>(row.answers_encrypted)) ?? {};
  return {
    id: row.id,
    subjectHash,
    currentQuestion: row.current_question ?? null,
    answers,
    progress: row.progress ?? 0,
    adultStatus: (row.adult_status ?? "unknown") as AdultStatus,
    expiresAt: row.expires_at,
  };
}

export async function upsertDraft(
  db: Db,
  subjectHash: string,
  input: { answers: LoveAnswers; currentQuestion: string | null; progress: number; adultStatus: AdultStatus },
): Promise<LoveDraft> {
  const ttlMs = loveConfig().draftTtlHours * 3_600_000;
  const { data, error } = await db
    .from("love_interview_drafts")
    .upsert(
      {
        subject_hash: subjectHash,
        current_question: input.currentQuestion,
        answers_encrypted: await encryptValue(input.answers),
        progress: input.progress,
        adult_status: input.adultStatus,
        consent_version: LOVE_CONSENT_VERSION,
        consented_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
      },
      { onConflict: "subject_hash" },
    )
    .select("*")
    .single();
  if (error || !data) throw roomError("INTERNAL_ERROR");
  const row = data as any;
  return {
    id: row.id,
    subjectHash,
    currentQuestion: row.current_question ?? null,
    answers: input.answers,
    progress: row.progress ?? 0,
    adultStatus: (row.adult_status ?? "unknown") as AdultStatus,
    expiresAt: row.expires_at,
  };
}

export async function deleteDraft(db: Db, subjectHash: string): Promise<void> {
  await db.from("love_interview_drafts").delete().eq("subject_hash", subjectHash);
}

/* --------------------------------- profile -------------------------------- */

function mapProfile(row: any, vector: LoveVector | null, summary: string): LoveProfile {
  return {
    id: row.id,
    subjectHash: row.subject_hash,
    status: row.status,
    relationshipIntention: row.relationship_intention ?? null,
    preferredLanguages: row.preferred_languages ?? [],
    summary,
    vector,
    vectorVersion: row.love_vector_version ?? LOVE_VECTOR_VERSION,
    loveEnabled: Boolean(row.love_enabled),
    loveDiscoverable: Boolean(row.love_discoverable),
    allowRequests: Boolean(row.allow_love_match_requests),
    publicPairRoomConsent: Boolean(row.public_pair_room_consent),
    adultStatus: (row.adult_status ?? "unknown") as AdultStatus,
    activatedAt: row.activated_at ?? null,
    pausedAt: row.paused_at ?? null,
    suspendedAt: row.suspended_at ?? null,
    updatedAt: row.updated_at,
  };
}

async function hydrate(row: any): Promise<LoveProfile> {
  const vector = await decryptValue<LoveVector>(row.love_vector_encrypted);
  const summary = (await decryptValue<string>(row.human_readable_summary_encrypted)) ?? "";
  return mapProfile(row, vector, summary);
}

export async function loadProfile(db: Db, subjectHash: string): Promise<LoveProfile | null> {
  const { data } = await db
    .from("love_profiles")
    .select("*")
    .eq("subject_hash", subjectHash)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return hydrate(data as any);
}

/**
 * Turns a completed interview draft into a stored (still invisible) profile.
 * The raw answers are deleted in the same step — only the encrypted vector and
 * the human readable summary survive.
 */
export async function buildProfileFromDraft(db: Db, draft: LoveDraft): Promise<LoveProfile> {
  const vector = buildLoveVector(draft.answers);
  const summary = humanReadableSummary(vector);
  const existing = await loadProfile(db, draft.subjectHash);

  const payload = {
    subject_hash: draft.subjectHash,
    status: existing?.status === "active" ? "active" : "draft",
    relationship_intention: vector.relationship_intention,
    values_data_encrypted: await encryptValue(vector.values),
    communication_data_encrypted: await encryptValue(vector.communication),
    connection_style_data_encrypted: await encryptValue({
      closeness: vector.closeness,
      expression: vector.expression,
    }),
    conflict_style_data_encrypted: await encryptValue(vector.conflict),
    daily_rhythm_data_encrypted: await encryptValue({
      rhythm: vector.rhythm,
      social_energy: vector.social_energy,
      interests: vector.interests,
    }),
    partner_preferences_encrypted: await encryptValue({
      preferences: vector.partner_preferences,
      boundaries: vector.boundaries,
    }),
    broad_region_encrypted: vector.broad_region ? await encryptValue(vector.broad_region) : null,
    preferred_languages: vector.languages,
    human_readable_summary_encrypted: await encryptValue(summary),
    love_vector_encrypted: await encryptValue(vector),
    love_vector_version: LOVE_VECTOR_VERSION,
    love_vector_integrity_hash: await integrityHash(vector),
    adult_status: draft.adultStatus,
    consent_version: LOVE_CONSENT_VERSION,
    consented_at: new Date().toISOString(),
    deleted_at: null,
  };

  const { data, error } = await db
    .from("love_profiles")
    .upsert(payload, { onConflict: "subject_hash" })
    .select("*")
    .single();
  if (error || !data) throw roomError("INTERNAL_ERROR");

  // Raw interview answers never outlive the confirmed profile.
  await deleteDraft(db, draft.subjectHash);
  return mapProfile(data as any, vector, summary);
}

export async function activateProfile(db: Db, subjectHash: string): Promise<LoveProfile> {
  const profile = await loadProfile(db, subjectHash);
  if (!profile) throw roomError("NOT_FOUND", "Es gibt noch kein Love-Profil.");
  const { data, error } = await db
    .from("love_profiles")
    .update({
      status: "active",
      love_enabled: true,
      love_discoverable: true,
      allow_love_match_requests: true,
      public_pair_room_consent: true,
      activated_at: new Date().toISOString(),
      paused_at: null,
    })
    .eq("id", profile.id)
    .select("*")
    .single();
  if (error || !data) throw roomError("INTERNAL_ERROR");
  return hydrate(data as any);
}

export async function pauseProfile(db: Db, subjectHash: string, reason = "user"): Promise<LoveProfile | null> {
  const profile = await loadProfile(db, subjectHash);
  if (!profile) return null;
  if (profile.status === "paused") return profile;
  const { data } = await db
    .from("love_profiles")
    .update({
      status: "paused",
      love_discoverable: false,
      allow_love_match_requests: false,
      paused_at: new Date().toISOString(),
    })
    .eq("id", profile.id)
    .select("*")
    .single();
  void reason;
  return data ? hydrate(data as any) : null;
}

/** Irreversible: draft, summary, vector, discoverability and open requests. */
export async function deleteLoveProfile(db: Db, subjectHash: string): Promise<boolean> {
  await deleteDraft(db, subjectHash);
  await db
    .from("love_match_requests")
    .update({ status: "cancelled" })
    .or(`requester_subject_hash.eq.${subjectHash},candidate_subject_hash.eq.${subjectHash}`)
    .in("status", ["candidate_found", "awaiting_sender_confirmation", "pending_recipient"]);
  const { data } = await db
    .from("love_profiles")
    .delete()
    .eq("subject_hash", subjectHash)
    .select("id");
  return ((data ?? []) as unknown[]).length > 0;
}

/* --------------------------------- blocks --------------------------------- */

export async function addLoveBlock(db: Db, blocker: string, blocked: string, reason?: string) {
  await db
    .from("love_profile_blocks")
    .upsert(
      { blocker_subject_hash: blocker, blocked_subject_hash: blocked, reason_code: reason ?? null },
      { onConflict: "blocker_subject_hash,blocked_subject_hash" },
    );
}

/** Blocks count in both directions, plus the general profile blocks. */
export async function loveBlocked(db: Db, a: string, b: string): Promise<boolean> {
  const { data } = await db
    .from("love_profile_blocks")
    .select("blocker_subject_hash")
    .or(
      `and(blocker_subject_hash.eq.${a},blocked_subject_hash.eq.${b}),and(blocker_subject_hash.eq.${b},blocked_subject_hash.eq.${a})`,
    )
    .limit(1);
  if (((data ?? []) as unknown[]).length) return true;
  const { isBlocked } = await import("../profile");
  return isBlocked(db, a, b);
}

/* -------------------------------- matching -------------------------------- */

export interface LoveCandidate {
  candidate_reference: string;
  resonance_label: string;
  reasons: string[];
  handle: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  status: string;
  expires_at: string;
}

async function publicProfileOf(db: Db, subjectHash: string) {
  const { data } = await db
    .from("user_rooms")
    .select("handle, room_name, description, avatar_url")
    .eq("owner_subject_hash", subjectHash)
    .maybeSingle();
  const row = data as any;
  return {
    handle: row?.handle ?? "anon",
    display_name: row?.room_name ?? "Crawler user",
    bio: row?.description ?? "",
    avatar_url: row?.avatar_url ?? null,
  };
}

async function openRequestBetween(db: Db, a: string, b: string) {
  const { data } = await db
    .from("love_match_requests")
    .select("*")
    .or(
      `and(requester_subject_hash.eq.${a},candidate_subject_hash.eq.${b}),and(requester_subject_hash.eq.${b},candidate_subject_hash.eq.${a})`,
    )
    .in("status", ["candidate_found", "awaiting_sender_confirmation", "pending_recipient", "accepted", "room_created"])
    .limit(1);
  return ((data ?? []) as any[])[0] ?? null;
}

async function inCooldown(db: Db, a: string, b: string): Promise<boolean> {
  const since = new Date(Date.now() - loveConfig().declineCooldownDays * 86_400_000).toISOString();
  const { data } = await db
    .from("love_match_requests")
    .select("id")
    .or(
      `and(requester_subject_hash.eq.${a},candidate_subject_hash.eq.${b}),and(requester_subject_hash.eq.${b},candidate_subject_hash.eq.${a})`,
    )
    .in("status", ["declined", "blocked", "reported"])
    .gte("updated_at", since)
    .limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

/** Exactly one candidate — never a browsable dating list, never a message. */
export async function findLoveCandidate(
  db: Db,
  me: LoveProfile,
): Promise<{ status: "no_candidate" | "candidate_found" | "pending"; candidate?: LoveCandidate }> {
  const pending = await db
    .from("love_match_requests")
    .select("*")
    .or(`requester_subject_hash.eq.${me.subjectHash},candidate_subject_hash.eq.${me.subjectHash}`)
    .in("status", ["candidate_found", "awaiting_sender_confirmation", "pending_recipient"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  const openRow = ((pending.data ?? []) as any[])[0];
  if (openRow) {
    const otherHash =
      openRow.requester_subject_hash === me.subjectHash
        ? openRow.candidate_subject_hash
        : openRow.requester_subject_hash;
    const shown = await publicProfileOf(db, otherHash);
    return {
      status: "pending",
      candidate: {
        candidate_reference: openRow.public_match_id,
        resonance_label: loveResonanceLabel(openRow.requester_score_internal ?? 0),
        reasons: (openRow.match_reasons_safe ?? []) as string[],
        ...shown,
        status: openRow.status,
        expires_at: openRow.expires_at,
      },
    };
  }

  if (!me.vector) return { status: "no_candidate" };

  const { data } = await db
    .from("love_profiles")
    .select("*")
    .neq("subject_hash", me.subjectHash)
    .eq("status", "active")
    .eq("love_enabled", true)
    .eq("love_discoverable", true)
    .eq("allow_love_match_requests", true)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .limit(300);

  let best: { profile: LoveProfile; score: number; reasons: string[]; candidateScore: number } | null = null;
  const minimum = loveConfig().minimumResonance;

  for (const row of (data ?? []) as any[]) {
    const other = await hydrate(row);
    if (!other.vector) continue;
    const { adultStatusEligible } = await import("./config");
    if (!adultStatusEligible(other.adultStatus)) continue;
    const scored = scoreLoveVectors(me.vector, other.vector);
    if (!scored) continue;
    if (scored.mutualScore < minimum) continue;
    if (best && scored.mutualScore <= best.score) continue;
    if (await loveBlocked(db, me.subjectHash, other.subjectHash)) continue;
    if (await inCooldown(db, me.subjectHash, other.subjectHash)) continue;
    if (await openRequestBetween(db, me.subjectHash, other.subjectHash)) continue;
    best = {
      profile: other,
      score: scored.mutualScore,
      reasons: scored.reasons,
      candidateScore: scored.candidateScore,
    };
  }

  if (!best) return { status: "no_candidate" };

  const { data: inserted, error } = await db
    .from("love_match_requests")
    .insert({
      public_match_id: `love_${randomId(8)}`,
      requester_subject_hash: me.subjectHash,
      candidate_subject_hash: best.profile.subjectHash,
      requester_score_internal: best.score,
      candidate_score_internal: best.candidateScore,
      match_reasons_safe: best.reasons,
      status: "awaiting_sender_confirmation",
      expires_at: new Date(Date.now() + loveConfig().requestTtlDays * 86_400_000).toISOString(),
    })
    .select("*")
    .single();
  if (error || !inserted) throw roomError("INTERNAL_ERROR");

  const shown = await publicProfileOf(db, best.profile.subjectHash);
  return {
    status: "candidate_found",
    candidate: {
      candidate_reference: (inserted as any).public_match_id,
      resonance_label: loveResonanceLabel(best.score),
      reasons: best.reasons,
      ...shown,
      status: "awaiting_sender_confirmation",
      expires_at: (inserted as any).expires_at,
    },
  };
}

export async function loadRequest(db: Db, publicMatchId: string) {
  const { data } = await db
    .from("love_match_requests")
    .select("*")
    .eq("public_match_id", publicMatchId)
    .maybeSingle();
  return (data as any) ?? null;
}

/** Only after an explicit confirmation does the other person hear anything. */
export async function sendLoveRequest(
  db: Db,
  subjectHash: string,
  candidateReference: string,
  idempotencyKey: string | null,
) {
  const row = await loadRequest(db, candidateReference);
  if (!row) throw roomError("NOT_FOUND", "Dieser Vorschlag ist nicht mehr vorhanden.");
  if (row.requester_subject_hash !== subjectHash) throw roomError("FORBIDDEN");

  if (row.status === "pending_recipient") {
    return { status: "pending_recipient" as const, duplicate: true, match_request_id: row.public_match_id };
  }
  if (row.status !== "awaiting_sender_confirmation" && row.status !== "candidate_found") {
    throw roomError("DUPLICATE_REQUEST", "Dieser Vorschlag wurde bereits bearbeitet.");
  }
  if (idempotencyKey) {
    const { data: seen } = await db
      .from("love_match_requests")
      .select("public_match_id, status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (seen) {
      return {
        status: (seen as any).status as string,
        duplicate: true,
        match_request_id: (seen as any).public_match_id as string,
      };
    }
  }

  await db
    .from("love_match_requests")
    .update({
      status: "pending_recipient",
      requester_confirmed_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
    })
    .eq("id", row.id);

  return { status: "pending_recipient" as const, duplicate: false, match_request_id: row.public_match_id };
}

export type LoveResponse = "accept" | "decline" | "block" | "report";

export async function respondToLoveRequest(
  db: Db,
  subjectHash: string,
  publicMatchId: string,
  response: LoveResponse,
): Promise<{ status: string; room_url: string | null; message: string }> {
  const row = await loadRequest(db, publicMatchId);
  if (!row) throw roomError("NOT_FOUND");
  if (row.candidate_subject_hash !== subjectHash) throw roomError("FORBIDDEN");
  if (row.status === "room_created") {
    return {
      status: "room_created",
      room_url: null,
      message: "Dieser Love Match ist bereits verbunden.",
    };
  }
  if (row.status !== "pending_recipient") {
    throw roomError("INVALID_INPUT", "Für diese Anfrage ist gerade keine Antwort möglich.");
  }

  const now = new Date().toISOString();

  if (response === "decline") {
    await db
      .from("love_match_requests")
      .update({ status: "declined", candidate_responded_at: now })
      .eq("id", row.id);
    return { status: "declined", room_url: null, message: "Declined. No reason is stored and nobody is told why." };
  }

  if (response === "block") {
    await addLoveBlock(db, subjectHash, row.requester_subject_hash, "love_block");
    await db
      .from("love_match_requests")
      .update({ status: "blocked", candidate_responded_at: now })
      .eq("id", row.id);
    return { status: "blocked", room_url: null, message: "Blocked. This person will never be suggested to you again." };
  }

  if (response === "report") {
    await addLoveBlock(db, subjectHash, row.requester_subject_hash, "love_report");
    await db
      .from("love_match_requests")
      .update({ status: "reported", candidate_responded_at: now })
      .eq("id", row.id);
    await db.from("moderation_decisions").insert({
      subject_type: "love_match_request",
      subject_id: row.id,
      decision: "reported",
      reason: "love_match_report",
    });
    return {
      status: "reported",
      room_url: null,
      message: "Reported and blocked. Our moderation reviews this case.",
    };
  }

  // accept — this is the second consent, so exactly one public pair room appears.
  const { createPairRoom, pairRoomUrl } = await import("../match/pairrooms");
  const { room } = await createPairRoom(
    db,
    row.requester_subject_hash,
    row.candidate_subject_hash,
    row.public_match_id,
  );
  await db
    .from("love_match_requests")
    .update({ status: "room_created", candidate_responded_at: now, room_id: room.id })
    .eq("id", row.id);

  return {
    status: "room_created",
    room_url: pairRoomUrl(room.public_slug),
    message:
      "Both of you accepted. Crawler opened a publicly readable Pair Room — only the two of you can post in it.",
  };
}

/** Requests visible to this person, in both roles. */
export async function loveRequestsFor(db: Db, subjectHash: string) {
  const { data } = await db
    .from("love_match_requests")
    .select("*")
    .or(`requester_subject_hash.eq.${subjectHash},candidate_subject_hash.eq.${subjectHash}`)
    .order("created_at", { ascending: false })
    .limit(20);
  return ((data ?? []) as any[]).map((row) => ({
    match_request_id: row.public_match_id,
    role: row.requester_subject_hash === subjectHash ? "requester" : "recipient",
    status: row.status,
    resonance_label: loveResonanceLabel(row.requester_score_internal ?? 0),
    reasons: (row.match_reasons_safe ?? []) as string[],
    expires_at: row.expires_at,
  }));
}
