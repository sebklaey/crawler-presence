/**
 * MCP handlers for Crawler Love — the optional romantic compatibility mode.
 *
 * Nothing here is derived from the general resonance patterns, the Knowledge
 * Core, room messages or earlier chats: a Love Profile only ever comes from
 * the Love interview the person explicitly started. Session ids, recovery
 * codes, raw answers and internal scores never appear in a response.
 */
import { roomError } from "./errors";
import { resolveIdentity, type McpMeta } from "./identity";
import { getDb, touchPresence, type Db } from "./store";
import {
  LOVE_CONSENT_VERSION,
  LOVE_INTRO,
  LOVE_NOT_A_DIAGNOSIS,
  LOVE_PAIR_ROOM_NOTICE,
  LOVE_PLAN_REQUIRED_MESSAGE,
  LOVE_PRICING_URL,
  LOVE_SAFETY_NOTICE,
  adultStatusEligible,
  loveConfig,
  type AdultStatus,
} from "./love/config";
import {
  LOVE_QUESTION_COUNT,
  answeredCount,
  nextQuestion,
  normaliseAnswer,
  progressOf,
  questionById,
  type LoveAnswers,
} from "./love/interview";
import {
  activateProfile,
  addLoveBlock,
  buildProfileFromDraft,
  deleteDraft,
  deleteLoveProfile,
  findLoveCandidate,
  loadDraft,
  loadProfile,
  loadRequest,
  loveRequestsFor,
  pauseProfile,
  respondToLoveRequest,
  sendLoveRequest,
  upsertDraft,
  type LoveProfile,
} from "./love/service";
import {
  LOVE_INTERVIEW_UI,
  LOVE_MATCH_UI,
  LOVE_PROFILE_UI,
  LOVE_UI_MIME,
  loveInterviewWidget,
  loveMatchWidget,
  loveProfileWidget,
} from "./love/widget";

const PLAN_NOTICE = {
  ok: false,
  code: "plan_required",
  required_plan: "pro",
  message: LOVE_PLAN_REQUIRED_MESSAGE,
  pricing_url: LOVE_PRICING_URL,
  cta_label: "View plans",
  checkout: null,
} as const;

function featureDisabled() {
  return {
    ok: false,
    code: "feature_disabled",
    message: "Crawler Love is currently not available.",
  };
}

async function planOf(db: Db, subjectHash: string): Promise<string> {
  const { resolveLinkedPlan } = await import("./planlink");
  const { plan } = await resolveLinkedPlan(db, subjectHash);
  return String(plan ?? "free");
}

function planAllows(plan: string): boolean {
  return plan === "pro" || plan === "business";
}

/** Identity + plan, and the downgrade rule: a lost plan pauses the profile. */
async function loveContext(meta: McpMeta) {
  const identity = await resolveIdentity(meta);
  const db = await getDb();
  await touchPresence(db, identity.subjectHash);
  const plan = await planOf(db, identity.subjectHash);
  if (!planAllows(plan)) {
    const profile = await loadProfile(db, identity.subjectHash);
    if (profile && profile.status === "active") await pauseProfile(db, identity.subjectHash, "downgrade");
  }
  return { db, subjectHash: identity.subjectHash, plan, allowed: planAllows(plan) };
}

function profileView(profile: LoveProfile) {
  return {
    status: profile.status,
    discoverable: profile.loveDiscoverable,
    allow_match_requests: profile.allowRequests,
    public_pair_room_consent: profile.publicPairRoomConsent,
    adult_status: profile.adultStatus,
    activated_at: profile.activatedAt,
    paused_at: profile.pausedAt,
    summary: profile.summary,
    consent_version: LOVE_CONSENT_VERSION,
  };
}

function interviewView(answers: LoveAnswers) {
  const question = nextQuestion(answers);
  const step = answeredCount(answers) + (question ? 1 : 0);
  return { question, step, progress: progressOf(answers), total: LOVE_QUESTION_COUNT };
}

function withInterviewWidget(result: Record<string, unknown>, question: any, step: number, progress: number) {
  if (!question) return result;
  return {
    ...result,
    _ui_uri: LOVE_INTERVIEW_UI,
    _ui_mime: LOVE_UI_MIME,
    _ui_html: loveInterviewWidget({
      question: question.prompt,
      area: question.area,
      options: question.options ?? [],
      hint: question.hint ?? null,
      progress,
      step,
      total: LOVE_QUESTION_COUNT,
    }),
  };
}

/* -------------------------------- interview ------------------------------- */

export async function handleStartLoveInterview(input: unknown, meta: McpMeta) {
  if (!loveConfig().enabled) return featureDisabled();
  const payload = (input ?? {}) as any;
  const ctx = await loveContext(meta);
  if (!ctx.allowed) return { ...PLAN_NOTICE, current_plan: ctx.plan };

  if (payload.consent !== true) {
    return {
      ok: false,
      code: "consent_required",
      intro: LOVE_INTRO,
      safety_notice: LOVE_SAFETY_NOTICE,
      pair_room_notice: LOVE_PAIR_ROOM_NOTICE,
      disclaimer: LOVE_NOT_A_DIAGNOSIS,
      consent_items: [
        "Take part in Crawler Love",
        "Create a separate Love Profile",
        "Use your interview answers for mutual matching",
        "Be discoverable by compatible Crawler Love participants",
        "Understand that an accepted Pair Room is publicly readable",
        `Confirm you are ${loveConfig().minimumAge} or older`,
      ],
      message:
        "Please confirm each point, then call this tool again with consent: true and adult_self_attestation: true.",
    };
  }

  const adultStatus: AdultStatus = payload.adult_self_attestation === true ? "self_attested" : "unknown";
  if (!adultStatusEligible(adultStatus)) {
    return {
      ok: false,
      code: "age_check_required",
      message: `Crawler Love is limited to adults aged ${loveConfig().minimumAge} and over. A self-confirmation is not a verified age check, and verified age is currently required.`,
      safety_notice: LOVE_SAFETY_NOTICE,
    };
  }

  const existing = await loadDraft(ctx.db, ctx.subjectHash);
  const answers = existing?.answers ?? {};
  const view = interviewView(answers);
  const draft = await upsertDraft(ctx.db, ctx.subjectHash, {
    answers,
    currentQuestion: view.question?.id ?? null,
    progress: view.progress,
    adultStatus,
  });

  return withInterviewWidget(
    {
      ok: true,
      interview_id: draft.id,
      intro: LOVE_INTRO,
      safety_notice: LOVE_SAFETY_NOTICE,
      disclaimer: LOVE_NOT_A_DIAGNOSIS,
      question_id: view.question?.id ?? null,
      question: view.question?.prompt ?? null,
      area: view.question?.area ?? null,
      options: view.question?.options ?? [],
      answer_kind: view.question?.kind ?? null,
      skippable: true,
      step: view.step,
      total_questions: LOVE_QUESTION_COUNT,
      progress: view.progress,
      draft_expires_at: draft.expiresAt,
    },
    view.question,
    view.step,
    view.progress,
  );
}

export async function handleAnswerLoveInterviewQuestion(input: unknown, meta: McpMeta) {
  if (!loveConfig().enabled) return featureDisabled();
  const payload = (input ?? {}) as any;
  const ctx = await loveContext(meta);
  if (!ctx.allowed) return { ...PLAN_NOTICE, current_plan: ctx.plan };

  const draft = await loadDraft(ctx.db, ctx.subjectHash);
  if (!draft) {
    return {
      ok: false,
      code: "no_interview",
      message: "There is no open Crawler Love interview. Start a new one with start_love_interview.",
    };
  }

  const question = questionById(String(payload.question_id ?? draft.currentQuestion ?? ""));
  if (!question) throw roomError("INVALID_INPUT", "Diese Frage gehört nicht zum Love-Interview.");

  const answers: LoveAnswers = { ...draft.answers };
  // Idempotent: answering the same question twice just overwrites the answer.
  answers[question.id] =
    payload.skip === true
      ? { value: [], skipped: true }
      : { value: normaliseAnswer(question, payload.answer), skipped: false };

  const view = interviewView(answers);
  const saved = await upsertDraft(ctx.db, ctx.subjectHash, {
    answers,
    currentQuestion: view.question?.id ?? null,
    progress: view.progress,
    adultStatus: draft.adultStatus,
  });

  if (!view.question) {
    const profile = await buildProfileFromDraft(ctx.db, saved);
    return {
      ok: true,
      interview_complete: true,
      progress: 100,
      profile: profileView(profile),
      next_step:
        "Show the summary, let the person edit it, and only call activate_love_profile after they explicitly approve it.",
      activation_notice:
        "Activate your Crawler Love Profile? Your protected compatibility pattern will be compared only with other users who have voluntarily activated Crawler Love. Your raw interview answers and exact matching vector will not be shown to them.",
      disclaimer: LOVE_NOT_A_DIAGNOSIS,
      _ui_uri: LOVE_PROFILE_UI,
      _ui_mime: LOVE_UI_MIME,
      _ui_html: loveProfileWidget({
        summary: profile.summary,
        status: profile.status,
        discoverable: profile.loveDiscoverable,
      }),
    };
  }

  return withInterviewWidget(
    {
      ok: true,
      interview_id: saved.id,
      interview_complete: false,
      question_id: view.question.id,
      question: view.question.prompt,
      area: view.question.area,
      options: view.question.options ?? [],
      answer_kind: view.question.kind,
      skippable: true,
      step: view.step,
      total_questions: LOVE_QUESTION_COUNT,
      progress: view.progress,
      draft_expires_at: saved.expiresAt,
    },
    view.question,
    view.step,
    view.progress,
  );
}

export async function handleGetLoveInterviewStatus(_input: unknown, meta: McpMeta) {
  if (!loveConfig().enabled) return featureDisabled();
  const ctx = await loveContext(meta);
  const draft = await loadDraft(ctx.db, ctx.subjectHash);
  const profile = await loadProfile(ctx.db, ctx.subjectHash);

  if (!draft) {
    return {
      ok: true,
      interview_open: false,
      has_profile: Boolean(profile),
      profile: profile ? profileView(profile) : null,
      message: profile
        ? "No open interview. Your Love Profile is ready to review."
        : "No Crawler Love interview yet.",
    };
  }

  const view = interviewView(draft.answers);
  return withInterviewWidget(
    {
      ok: true,
      interview_open: true,
      interview_id: draft.id,
      question_id: view.question?.id ?? null,
      question: view.question?.prompt ?? null,
      area: view.question?.area ?? null,
      options: view.question?.options ?? [],
      step: view.step,
      total_questions: LOVE_QUESTION_COUNT,
      progress: view.progress,
      draft_expires_at: draft.expiresAt,
      has_profile: Boolean(profile),
    },
    view.question,
    view.step,
    view.progress,
  );
}

/* --------------------------------- profile -------------------------------- */

export async function handleReviewLoveProfile(_input: unknown, meta: McpMeta) {
  if (!loveConfig().enabled) return featureDisabled();
  const ctx = await loveContext(meta);
  const profile = await loadProfile(ctx.db, ctx.subjectHash);
  if (!profile) {
    return {
      ok: false,
      code: "no_profile",
      message: "You do not have a Crawler Love Profile yet.",
    };
  }
  return {
    ok: true,
    profile: profileView(profile),
    plan_paused: !ctx.allowed && profile.status === "paused",
    disclaimer: LOVE_NOT_A_DIAGNOSIS,
    actions: ["Edit", "Save as draft", "Activate Love Profile", "Pause", "Delete"],
    _ui_uri: LOVE_PROFILE_UI,
    _ui_mime: LOVE_UI_MIME,
    _ui_html: loveProfileWidget({
      summary: profile.summary,
      status: profile.status,
      discoverable: profile.loveDiscoverable,
    }),
  };
}

export async function handleActivateLoveProfile(input: unknown, meta: McpMeta) {
  if (!loveConfig().enabled) return featureDisabled();
  const payload = (input ?? {}) as any;
  const ctx = await loveContext(meta);
  if (!ctx.allowed) return { ...PLAN_NOTICE, current_plan: ctx.plan };

  if (payload.confirm_discoverability !== true || payload.confirm_public_pair_room !== true) {
    return {
      ok: false,
      code: "confirmation_required",
      message:
        "Activation needs two explicit confirmations: being discoverable for Crawler Love, and understanding that an accepted Pair Room is publicly readable.",
      pair_room_notice: LOVE_PAIR_ROOM_NOTICE,
    };
  }

  const existing = await loadProfile(ctx.db, ctx.subjectHash);
  if (!existing) {
    return { ok: false, code: "no_profile", message: "Complete the Crawler Love interview first." };
  }
  if (!adultStatusEligible(existing.adultStatus)) {
    return {
      ok: false,
      code: "age_check_required",
      message: `Crawler Love is limited to adults aged ${loveConfig().minimumAge} and over.`,
    };
  }
  if (existing.status === "active") {
    return { ok: true, already_active: true, profile: profileView(existing) };
  }

  const profile = await activateProfile(ctx.db, ctx.subjectHash);
  return {
    ok: true,
    profile: profileView(profile),
    message:
      "Your Love Profile is active. Crawler compares it only with other voluntarily activated Love Profiles.",
    disclaimer: LOVE_NOT_A_DIAGNOSIS,
    _ui_uri: LOVE_PROFILE_UI,
    _ui_mime: LOVE_UI_MIME,
    _ui_html: loveProfileWidget({
      summary: profile.summary,
      status: profile.status,
      discoverable: profile.loveDiscoverable,
    }),
  };
}

export async function handlePauseLoveProfile(_input: unknown, meta: McpMeta) {
  if (!loveConfig().enabled) return featureDisabled();
  const ctx = await loveContext(meta);
  const profile = await pauseProfile(ctx.db, ctx.subjectHash);
  if (!profile) return { ok: false, code: "no_profile", message: "You do not have a Crawler Love Profile." };
  return {
    ok: true,
    profile: profileView(profile),
    message: "Your Love Profile is paused. It is no longer used for new matches and nothing was deleted.",
  };
}

export async function handleDeleteLoveProfile(input: unknown, meta: McpMeta) {
  if (!loveConfig().enabled) return featureDisabled();
  const payload = (input ?? {}) as any;
  const ctx = await loveContext(meta);
  if (payload.confirm !== true) {
    return {
      ok: false,
      code: "confirmation_required",
      message:
        "Deleting removes your interview draft, your Love summary, your protected compatibility pattern and your open Love match requests. Call again with confirm: true.",
    };
  }
  await deleteDraft(ctx.db, ctx.subjectHash);
  const deleted = await deleteLoveProfile(ctx.db, ctx.subjectHash);
  return {
    ok: true,
    deleted,
    message: deleted
      ? "Your Crawler Love Profile and all Love interview data were deleted."
      : "There was no Love Profile left to delete. Any interview draft was removed.",
  };
}

/* -------------------------------- matching -------------------------------- */

export async function handleFindLoveCandidate(_input: unknown, meta: McpMeta) {
  if (!loveConfig().enabled) return featureDisabled();
  const ctx = await loveContext(meta);
  if (!ctx.allowed) return { ...PLAN_NOTICE, current_plan: ctx.plan };

  const profile = await loadProfile(ctx.db, ctx.subjectHash);
  if (!profile || profile.status !== "active") {
    return {
      ok: false,
      code: "profile_not_active",
      message: "Activate your Crawler Love Profile first — only activated profiles take part in matching.",
    };
  }
  if (!adultStatusEligible(profile.adultStatus)) {
    return { ok: false, code: "age_check_required", message: "Crawler Love is limited to adults." };
  }

  const result = await findLoveCandidate(ctx.db, profile);
  if (result.status === "no_candidate" || !result.candidate) {
    return {
      ok: true,
      candidate_found: false,
      message:
        "No compatible Crawler Love participant right now. Crawler only suggests someone when the possible resonance is mutual.",
    };
  }

  const candidate = result.candidate;
  return {
    ok: true,
    candidate_found: true,
    pending: result.status === "pending",
    candidate_reference: candidate.candidate_reference,
    handle: candidate.handle,
    display_name: candidate.display_name,
    bio: candidate.bio,
    avatar: candidate.avatar_url,
    resonance: candidate.resonance_label,
    reasons: candidate.reasons,
    request_status: candidate.status,
    expires_at: candidate.expires_at,
    pair_room_notice: LOVE_PAIR_ROOM_NOTICE,
    next_step:
      "Nothing was sent. Ask the person whether to send a Love Match request, and only then call send_love_match_request.",
    _ui_uri: LOVE_MATCH_UI,
    _ui_mime: LOVE_UI_MIME,
    _ui_html: loveMatchWidget({
      handle: candidate.handle,
      display_name: candidate.display_name,
      bio: candidate.bio,
      resonance_label: candidate.resonance_label,
      reasons: candidate.reasons,
      mode: "candidate",
    }),
  };
}

export async function handleSendLoveMatchRequest(input: unknown, meta: McpMeta) {
  if (!loveConfig().enabled) return featureDisabled();
  const payload = (input ?? {}) as any;
  const ctx = await loveContext(meta);
  if (!ctx.allowed) return { ...PLAN_NOTICE, current_plan: ctx.plan };

  if (payload.confirmation !== true) {
    return {
      ok: false,
      code: "confirmation_required",
      message: "A Love Match request is only sent after an explicit confirmation.",
      pair_room_notice: LOVE_PAIR_ROOM_NOTICE,
    };
  }

  const result = await sendLoveRequest(
    ctx.db,
    ctx.subjectHash,
    String(payload.candidate_reference ?? ""),
    payload.idempotency_key ? String(payload.idempotency_key) : null,
  );

  return {
    ok: true,
    match_request_id: result.match_request_id,
    status: result.status,
    duplicate: result.duplicate,
    message: result.duplicate
      ? "This request was already sent — nothing was sent twice."
      : "Your Love Match request was sent. The other person decides freely and you only receive a neutral status.",
    pair_room_notice: LOVE_PAIR_ROOM_NOTICE,
  };
}

export async function handleRespondToLoveMatch(input: unknown, meta: McpMeta) {
  if (!loveConfig().enabled) return featureDisabled();
  const payload = (input ?? {}) as any;
  const ctx = await loveContext(meta);

  const response = String(payload.response ?? "");
  if (!["accept", "decline", "block", "report"].includes(response)) {
    throw roomError("INVALID_INPUT", "Antwort muss accept, decline, block oder report sein.");
  }
  const matchId = String(payload.match_request_id ?? "");
  if (response === "accept" && payload.confirm_public_pair_room !== true) {
    return {
      ok: false,
      code: "confirmation_required",
      message: LOVE_PAIR_ROOM_NOTICE,
      next_step: "Call again with confirm_public_pair_room: true once the person agrees.",
    };
  }

  const existing = await loadRequest(ctx.db, matchId);
  if (existing && existing.candidate_subject_hash !== ctx.subjectHash) throw roomError("FORBIDDEN");

  const result = await respondToLoveRequest(
    ctx.db,
    ctx.subjectHash,
    matchId,
    response as "accept" | "decline" | "block" | "report",
  );
  return {
    ok: true,
    status: result.status,
    room_url: result.room_url,
    message: result.message,
    pair_room_notice: result.room_url ? LOVE_PAIR_ROOM_NOTICE : null,
  };
}

/** Never suggest this person again — no request is sent. */
export async function handleLoveMatchRequests(_input: unknown, meta: McpMeta) {
  if (!loveConfig().enabled) return featureDisabled();
  const ctx = await loveContext(meta);
  const requests = await loveRequestsFor(ctx.db, ctx.subjectHash);
  return { ok: true, requests, count: requests.length };
}

export async function blockLoveCandidate(db: Db, blocker: string, blocked: string) {
  await addLoveBlock(db, blocker, blocked, "not_interested");
}
