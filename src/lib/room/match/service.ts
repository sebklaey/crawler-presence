/**
 * Match orchestration: candidate search, consent handling, pair room creation.
 *
 * Consent is two-sided: nothing is connected before both sides accept, and no
 * identity information is ever revealed before a pair room exists.
 */
import { randomId } from "../crypto";
import { roomError } from "../errors";
import { isBlocked } from "../profile";
import type { Db } from "../store";
import {
  DECLINE_COOLDOWN_DAYS,
  MIN_RESONANCE,
  REQUEST_TTL_DAYS,
  resonanceLabel,
} from "./config";
import { createPairRoom, pairRoomUrl } from "./pairrooms";
import { getActivePattern, setPatternStatus, toScorable, type PatternRow } from "./patterns";
import { scorePatterns } from "./scoring";

export interface MatchRow {
  id: string;
  public_match_id: string;
  requester_pattern_id: string;
  candidate_pattern_id: string;
  score: number;
  safe_reasons: string[];
  requester_status: string;
  candidate_status: string;
  state: string;
  room_id: string | null;
  created_at: string;
  expires_at: string;
}

async function logEvent(db: Db, eventType: string, metadata: Record<string, unknown> = {}) {
  await db.from("match_events").insert({ event_type: eventType, metadata });
}

async function openMatchesFor(db: Db, patternId: string): Promise<MatchRow[]> {
  const { data } = await db
    .from("match_requests")
    .select("*")
    .or(`requester_pattern_id.eq.${patternId},candidate_pattern_id.eq.${patternId}`)
    .in("state", ["candidate_found", "awaiting_response", "connected"])
    .order("created_at", { ascending: false });
  return ((data ?? []) as MatchRow[]).filter(
    (row) => row.state === "connected" || new Date(row.expires_at).getTime() > Date.now(),
  );
}

async function recentlyPaired(db: Db, aId: string, bId: string): Promise<boolean> {
  const since = new Date(Date.now() - DECLINE_COOLDOWN_DAYS * 86_400_000).toISOString();
  const { data } = await db
    .from("match_requests")
    .select("id, state, created_at")
    .or(
      `and(requester_pattern_id.eq.${aId},candidate_pattern_id.eq.${bId}),and(requester_pattern_id.eq.${bId},candidate_pattern_id.eq.${aId})`,
    )
    .gte("created_at", since)
    .limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

export interface MatchProposal {
  public_match_id: string;
  resonance: number;
  resonance_label: string;
  reasons: string[];
  state: string;
  your_status: string;
  other_status: string;
  expires_at: string;
  room_url: string | null;
}

function proposalOf(row: MatchRow, viewerIsRequester: boolean): MatchProposal {
  return {
    public_match_id: row.public_match_id,
    resonance: row.score,
    resonance_label: resonanceLabel(row.score),
    reasons: Array.isArray(row.safe_reasons) ? row.safe_reasons : [],
    state: row.state,
    your_status: viewerIsRequester ? row.requester_status : row.candidate_status,
    other_status: viewerIsRequester ? row.candidate_status : row.requester_status,
    expires_at: row.expires_at,
    room_url: null,
  };
}

/** Finds the single best compatible candidate — never a browsable list. */
export async function findMatch(db: Db, subjectHash: string): Promise<{
  status: "no_pattern" | "no_candidate" | "candidate_found" | "pending";
  match?: MatchProposal;
}> {
  const mine = await getActivePattern(db, subjectHash);
  if (!mine) return { status: "no_pattern" };

  const open = await openMatchesFor(db, mine.id);
  if (open.length) {
    const row = open[0]!;
    return { status: "pending", match: proposalOf(row, row.requester_pattern_id === mine.id) };
  }

  const { data } = await db
    .from("resonance_patterns")
    .select("*")
    .neq("subject_hash", subjectHash)
    .eq("status", "searching")
    .is("deleted_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(400);

  const candidates = (data ?? []) as PatternRow[];
  let best: { row: PatternRow; score: number; reasons: string[] } | null = null;

  for (const candidate of candidates) {
    const { score, reasons } = scorePatterns(toScorable(mine), toScorable(candidate));
    if (score < MIN_RESONANCE) continue;
    if (best && score <= best.score) continue;
    if (await isBlocked(db, subjectHash, candidate.subject_hash)) continue;
    if (await recentlyPaired(db, mine.id, candidate.id)) continue;
    if ((await openMatchesFor(db, candidate.id)).length) continue;
    best = { row: candidate, score, reasons };
  }

  if (!best) {
    await logEvent(db, "match_search_no_candidate");
    return { status: "no_candidate" };
  }

  const { data: inserted, error } = await db
    .from("match_requests")
    .insert({
      public_match_id: `m_${randomId(8)}`,
      requester_pattern_id: mine.id,
      candidate_pattern_id: best.row.id,
      score: best.score,
      safe_reasons: best.reasons,
      state: "candidate_found",
      expires_at: new Date(Date.now() + REQUEST_TTL_DAYS * 86_400_000).toISOString(),
    })
    .select("*")
    .single();
  if (error || !inserted) throw roomError("INTERNAL_ERROR");

  await logEvent(db, "match_proposed", { score: best.score });
  return { status: "candidate_found", match: proposalOf(inserted as MatchRow, true) };
}

export async function matchStatus(db: Db, subjectHash: string) {
  const mine = await getActivePattern(db, subjectHash);
  if (!mine) return { status: "no_pattern" as const, matches: [] };

  const rows = await openMatchesFor(db, mine.id);
  const matches: MatchProposal[] = [];
  for (const row of rows) {
    const proposal = proposalOf(row, row.requester_pattern_id === mine.id);
    if (row.room_id) {
      const { data: room } = await db
        .from("rooms")
        .select("public_slug")
        .eq("id", row.room_id)
        .maybeSingle();
      const slug = (room as any)?.public_slug;
      if (slug) proposal.room_url = pairRoomUrl(slug);
    }
    matches.push(proposal);
  }
  return { status: "ok" as const, matches };
}

/** Accept, decline or block. A pair room appears only when both accept. */
export async function respondToMatch(
  db: Db,
  subjectHash: string,
  publicMatchId: string,
  decision: "accept" | "decline" | "block",
) {
  const mine = await getActivePattern(db, subjectHash);
  if (!mine) throw roomError("NOT_FOUND", "Du hast noch kein Schwingungsmuster.");

  const { data: row } = await db
    .from("match_requests")
    .select("*")
    .eq("public_match_id", publicMatchId)
    .maybeSingle();
  if (!row) throw roomError("NOT_FOUND");
  const match = row as MatchRow;

  const isRequester = match.requester_pattern_id === mine.id;
  const isCandidate = match.candidate_pattern_id === mine.id;
  if (!isRequester && !isCandidate) throw roomError("FORBIDDEN");
  if (match.state === "connected") {
    throw roomError("DUPLICATE_REQUEST", "Dieser Match ist bereits verbunden.");
  }

  const otherPatternId = isRequester ? match.candidate_pattern_id : match.requester_pattern_id;
  const { data: otherPattern } = await db
    .from("resonance_patterns")
    .select("id, subject_hash")
    .eq("id", otherPatternId)
    .maybeSingle();

  if (decision === "block") {
    const other = (otherPattern as any)?.subject_hash as string | undefined;
    if (other) {
      const { blockPerson } = await import("../profile");
      await blockPerson(db, subjectHash, other, "match_block");
    }
    await db
      .from("match_requests")
      .update({ state: "blocked", resolved_at: new Date().toISOString() })
      .eq("id", match.id);
    await logEvent(db, "match_blocked");
    return { state: "blocked" as const, room_url: null, message: "Blockiert. Ihr werdet nicht mehr vorgeschlagen." };
  }

  if (decision === "decline") {
    await db
      .from("match_requests")
      .update({
        state: "declined",
        requester_status: isRequester ? "declined" : match.requester_status,
        candidate_status: isCandidate ? "declined" : match.candidate_status,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", match.id);
    await logEvent(db, "match_declined");
    return { state: "declined" as const, room_url: null, message: "Abgelehnt. Du kannst jederzeit erneut suchen." };
  }

  const requesterStatus = isRequester ? "accepted" : match.requester_status;
  const candidateStatus = isCandidate ? "accepted" : match.candidate_status;
  const bothAccepted = requesterStatus === "accepted" && candidateStatus === "accepted";

  if (!bothAccepted) {
    await db
      .from("match_requests")
      .update({
        requester_status: requesterStatus,
        candidate_status: candidateStatus,
        state: "awaiting_response",
      })
      .eq("id", match.id);
    return {
      state: "awaiting_response" as const,
      room_url: null,
      message: "Zugestimmt. Sobald die andere Seite ebenfalls zustimmt, entsteht ein öffentlicher Pair Room.",
    };
  }

  const otherSubject = (otherPattern as any)?.subject_hash as string | undefined;
  if (!otherSubject) throw roomError("INTERNAL_ERROR");

  const { room } = await createPairRoom(db, subjectHash, otherSubject, match.public_match_id);
  await db
    .from("match_requests")
    .update({
      requester_status: "accepted",
      candidate_status: "accepted",
      state: "connected",
      room_id: room.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", match.id);

  await Promise.all([
    setPatternStatus(db, match.requester_pattern_id, "matched"),
    setPatternStatus(db, match.candidate_pattern_id, "matched"),
    logEvent(db, "match_connected", { score: match.score }),
  ]);

  return {
    state: "connected" as const,
    room_url: pairRoomUrl(room.public_slug),
    message: "Verbunden. Der öffentliche Pair Room ist eröffnet.",
  };
}
