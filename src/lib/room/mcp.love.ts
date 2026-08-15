/**
 * MCP tool descriptors for Crawler Love (Pro and Business).
 * Annotations match the real side effects: only respond_to_love_match and
 * delete_love_profile are destructive, and find_love_candidate never contacts
 * anyone.
 */
import type { McpMeta } from "./identity";
import { LOVE_NOT_A_DIAGNOSIS, LOVE_PRICING_URL } from "./love/config";
import {
  handleActivateLoveProfile,
  handleAnswerLoveInterviewQuestion,
  handleDeleteLoveProfile,
  handleFindLoveCandidate,
  handleGetLoveInterviewStatus,
  handleLoveMatchRequests,
  handlePauseLoveProfile,
  handleRespondToLoveMatch,
  handleReviewLoveProfile,
  handleSendLoveMatchRequest,
  handleStartLoveInterview,
} from "./tools.love";

type Json = Record<string, unknown>;

export interface LoveToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  outputSchema: Json;
  annotations: Json;
  handler: (input: unknown, meta: McpMeta) => Promise<Json>;
  summary: (result: any) => string;
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false };
const WRITE_IDEMPOTENT = { ...WRITE, idempotentHint: true };
const WRITE_OPEN = { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true };
const DESTRUCTIVE_OPEN = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: true,
  idempotentHint: true,
};
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true };

const DISCLAIMER = `_${LOVE_NOT_A_DIAGNOSIS}_`;

function planLine(result: any): string | null {
  if (result?.code !== "plan_required") return null;
  return `${result.message}\n\nView plans: ${result.pricing_url ?? LOVE_PRICING_URL}`;
}

function questionSummary(result: any): string {
  const plan = planLine(result);
  if (plan) return plan;
  if (result?.code === "consent_required") {
    return [
      `## Crawler Love`,
      result.intro,
      result.safety_notice,
      (result.consent_items ?? []).map((item: string) => `- ${item}`).join("\n"),
      result.message,
    ].join("\n\n");
  }
  if (result?.ok === false) return String(result.message ?? "Crawler Love is not available right now.");
  if (result?.interview_complete) return profileSummary(result);
  if (!result?.question) return String(result?.message ?? "No open Crawler Love interview.");
  const options = (result.options ?? []) as string[];
  return [
    `### ${result.area} · Question ${result.step} of ${result.total_questions} (${result.progress}%)`,
    result.question,
    options.length ? options.map((o) => `- ${o}`).join("\n") : "",
    "_You can skip any question, and pause and continue at any time._",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function profileSummary(result: any): string {
  const plan = planLine(result);
  if (plan) return plan;
  if (result?.ok === false) return String(result.message ?? "");
  const profile = result.profile ?? {};
  return [
    profile.summary ?? "",
    `Status: **${profile.status}**${profile.discoverable ? " · discoverable" : " · not discoverable"}`,
    result.activation_notice ?? result.message ?? "",
    DISCLAIMER,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function candidateSummary(result: any): string {
  const plan = planLine(result);
  if (plan) return plan;
  if (result?.ok === false || result?.candidate_found === false) {
    return String(result.message ?? "No candidate right now.");
  }
  return [
    `## @${result.handle} · ${result.display_name}`,
    `**${result.resonance}**`,
    result.bio ? result.bio : "",
    (result.reasons ?? []).map((r: string) => `- ${r}`).join("\n"),
    result.pair_room_notice,
    result.next_step,
    DISCLAIMER,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const LOVE_TOOLS: LoveToolDefinition[] = [
  {
    name: "start_love_interview",
    title: "Crawler Love interview",
    description:
      "Use this when a Pro or Business user explicitly wants to begin the Crawler Love compatibility interview. Crawler Love is a voluntary romantic mode with its own consent, its own profile and its own matching pool — never derived from the general Crawler profile, earlier chats or the Knowledge Core. Ask the consent points and the adult confirmation before calling with consent: true.",
    inputSchema: {
      type: "object",
      properties: {
        consent: { type: "boolean", description: "The user explicitly agreed to all consent points." },
        adult_self_attestation: {
          type: "boolean",
          description: "The user confirmed being 18 or older. This is a self-confirmation, never a verified age.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      description: "Consent/age gates return ok: false with a different shape; only the success payload is fully typed here.",
      properties: {
        ok: { type: "boolean" },
        code: { type: "string", description: "Present only on non-success responses (e.g. consent_required, age_check_required)." },
        interview_id: { type: "string" },
        intro: { type: "string" },
        safety_notice: { type: "string" },
        pair_room_notice: { type: "string" },
        disclaimer: { type: "string" },
        consent_items: { type: "array", items: { type: "string" } },
        question_id: { type: ["string", "null"] },
        question: { type: ["string", "null"] },
        area: { type: ["string", "null"] },
        options: { type: "array", items: { type: "string" } },
        answer_kind: { type: ["string", "null"] },
        skippable: { type: "boolean" },
        step: { type: "integer" },
        total_questions: { type: "integer" },
        progress: { type: "integer" },
        draft_expires_at: { type: "string" },
        message: { type: "string" },
      },
      required: ["ok"],
      additionalProperties: true,
    },
    annotations: WRITE,
    handler: (input, meta) => handleStartLoveInterview(input, meta) as Promise<Json>,
    summary: questionSummary,
  },
  {
    name: "answer_love_interview_question",
    title: "Answer Love interview question",
    description:
      "Use this when the user wants to answer or skip the current Crawler Love interview question. Ask exactly one question per step, never several at once, and never invent an answer the user did not give.",
    inputSchema: {
      type: "object",
      properties: {
        interview_id: { type: "string", description: "Interview reference from the previous step." },
        question_id: { type: "string", description: "Id of the question being answered." },
        answer: { type: "string", description: "The user's own words or chosen options, comma separated." },
        skip: { type: "boolean", description: "True when the user prefers to skip this question." },
        idempotency_key: { type: "string", description: "Optional key so a repeat does not duplicate." },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      description: "Shape differs between an open next question and interview completion.",
      properties: {
        ok: { type: "boolean" },
        code: { type: "string", description: "Present only when there is no open interview (no_interview)." },
        message: { type: "string" },
        interview_id: { type: "string" },
        interview_complete: { type: "boolean" },
        question_id: { type: ["string", "null"] },
        question: { type: ["string", "null"] },
        area: { type: ["string", "null"] },
        options: { type: "array", items: { type: "string" } },
        answer_kind: { type: ["string", "null"] },
        skippable: { type: "boolean" },
        step: { type: "integer" },
        total_questions: { type: "integer" },
        progress: { type: "integer" },
        draft_expires_at: { type: "string" },
        profile: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "active", "paused"] },
            discoverable: { type: "boolean" },
            allow_match_requests: { type: "boolean" },
            public_pair_room_consent: { type: "boolean" },
            adult_status: { type: "string", enum: ["unknown", "self_attested"] },
            activated_at: { type: ["string", "null"] },
            paused_at: { type: ["string", "null"] },
            summary: { type: "string" },
            consent_version: { type: "string" },
          },
          required: [
            "status",
            "discoverable",
            "allow_match_requests",
            "public_pair_room_consent",
            "adult_status",
            "activated_at",
            "paused_at",
            "summary",
            "consent_version",
          ],
          additionalProperties: false,
        },
        next_step: { type: "string" },
        activation_notice: { type: "string" },
        disclaimer: { type: "string" },
      },
      required: ["ok"],
      additionalProperties: true,
    },
    annotations: { ...WRITE_IDEMPOTENT },
    handler: (input, meta) => handleAnswerLoveInterviewQuestion(input, meta) as Promise<Json>,
    summary: questionSummary,
  },
  {
    name: "get_love_interview_status",
    title: "Love interview status",
    description:
      "Use this when the user wants to continue or review their own Crawler Love interview progress. Read-only and always limited to the current person.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      description: "No-interview and open-interview responses have different fields.",
      properties: {
        ok: { type: "boolean" },
        interview_open: { type: "boolean" },
        has_profile: { type: "boolean" },
        profile: { type: ["object", "null"], properties: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "active", "paused"] },
            discoverable: { type: "boolean" },
            allow_match_requests: { type: "boolean" },
            public_pair_room_consent: { type: "boolean" },
            adult_status: { type: "string", enum: ["unknown", "self_attested"] },
            activated_at: { type: ["string", "null"] },
            paused_at: { type: ["string", "null"] },
            summary: { type: "string" },
            consent_version: { type: "string" },
          },
          required: [
            "status",
            "discoverable",
            "allow_match_requests",
            "public_pair_room_consent",
            "adult_status",
            "activated_at",
            "paused_at",
            "summary",
            "consent_version",
          ],
          additionalProperties: false,
        }.properties, additionalProperties: false },
        message: { type: "string" },
        interview_id: { type: "string" },
        question_id: { type: ["string", "null"] },
        question: { type: ["string", "null"] },
        area: { type: ["string", "null"] },
        options: { type: "array", items: { type: "string" } },
        step: { type: "integer" },
        total_questions: { type: "integer" },
        progress: { type: "integer" },
        draft_expires_at: { type: "string" },
      },
      required: ["ok", "interview_open", "has_profile"],
      additionalProperties: true,
    },
    annotations: { ...READ_ONLY, idempotentHint: true },
    handler: (input, meta) => handleGetLoveInterviewStatus(input, meta) as Promise<Json>,
    summary: questionSummary,
  },
  {
    name: "review_love_profile",
    title: "Review Love Profile",
    description:
      "Use this when the user wants to review the human-readable Love Profile generated from their completed interview. Never reveals the internal compatibility vector, raw answers or scores.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      description: "code=no_profile responses have no profile field.",
      properties: {
        ok: { type: "boolean" },
        code: { type: "string" },
        message: { type: "string" },
        profile: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "active", "paused"] },
            discoverable: { type: "boolean" },
            allow_match_requests: { type: "boolean" },
            public_pair_room_consent: { type: "boolean" },
            adult_status: { type: "string", enum: ["unknown", "self_attested"] },
            activated_at: { type: ["string", "null"] },
            paused_at: { type: ["string", "null"] },
            summary: { type: "string" },
            consent_version: { type: "string" },
          },
          required: [
            "status",
            "discoverable",
            "allow_match_requests",
            "public_pair_room_consent",
            "adult_status",
            "activated_at",
            "paused_at",
            "summary",
            "consent_version",
          ],
          additionalProperties: false,
        },
        plan_paused: { type: "boolean" },
        disclaimer: { type: "string" },
        actions: { type: "array", items: { type: "string" } },
      },
      required: ["ok"],
      additionalProperties: true,
    },
    annotations: { ...READ_ONLY, idempotentHint: true },
    handler: (input, meta) => handleReviewLoveProfile(input, meta) as Promise<Json>,
    summary: profileSummary,
  },
  {
    name: "activate_love_profile",
    title: "Activate Love Profile",
    description:
      "Use this when the user explicitly approves their Love Profile and wants to become discoverable for Crawler Love matching. Requires two confirmations: discoverability and the publicly readable Pair Room.",
    inputSchema: {
      type: "object",
      properties: {
        profile_version: { type: "integer", description: "Version of the reviewed profile." },
        confirm_discoverability: { type: "boolean" },
        confirm_public_pair_room: { type: "boolean" },
        idempotency_key: { type: "string" },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      description: "Confirmation, missing-profile, age-check and already-active responses each omit some fields.",
      properties: {
        ok: { type: "boolean" },
        code: { type: "string" },
        message: { type: "string" },
        pair_room_notice: { type: "string" },
        already_active: { type: "boolean" },
        profile: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "active", "paused"] },
            discoverable: { type: "boolean" },
            allow_match_requests: { type: "boolean" },
            public_pair_room_consent: { type: "boolean" },
            adult_status: { type: "string", enum: ["unknown", "self_attested"] },
            activated_at: { type: ["string", "null"] },
            paused_at: { type: ["string", "null"] },
            summary: { type: "string" },
            consent_version: { type: "string" },
          },
          required: [
            "status",
            "discoverable",
            "allow_match_requests",
            "public_pair_room_consent",
            "adult_status",
            "activated_at",
            "paused_at",
            "summary",
            "consent_version",
          ],
          additionalProperties: false,
        },
        disclaimer: { type: "string" },
      },
      required: ["ok"],
      additionalProperties: true,
    },
    annotations: WRITE_OPEN,
    handler: (input, meta) => handleActivateLoveProfile(input, meta) as Promise<Json>,
    summary: profileSummary,
  },
  {
    name: "find_love_candidate",
    title: "Find a Love candidate",
    description:
      "Use this when an eligible user wants Crawler to privately calculate one potential Love match without contacting that person. Suggests at most one candidate, sends nothing and never shows a browsable list.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      description: "candidate_found: false responses omit the candidate fields.",
      properties: {
        ok: { type: "boolean" },
        code: { type: "string" },
        message: { type: "string" },
        candidate_found: { type: "boolean" },
        pending: { type: "boolean" },
        candidate_reference: { type: "string" },
        handle: { type: "string" },
        display_name: { type: "string" },
        bio: { type: "string" },
        avatar: { type: ["string", "null"] },
        resonance: { type: "string" },
        reasons: { type: "array", items: { type: "string" } },
        request_status: { type: "string" },
        expires_at: { type: "string" },
        pair_room_notice: { type: "string" },
        next_step: { type: "string" },
      },
      required: ["ok"],
      additionalProperties: true,
    },
    annotations: READ_ONLY,
    handler: (input, meta) => handleFindLoveCandidate(input, meta) as Promise<Json>,
    summary: candidateSummary,
  },
  {
    name: "send_love_match_request",
    title: "Send Love Match request",
    description:
      "Use this when the user has reviewed one suggested candidate and explicitly wants to send that person a Love Match request. Never call this automatically after find_love_candidate.",
    inputSchema: {
      type: "object",
      properties: {
        candidate_reference: { type: "string", description: "Reference from find_love_candidate." },
        confirmation: { type: "boolean", description: "The user explicitly confirmed sending." },
        idempotency_key: { type: "string" },
      },
      required: ["candidate_reference"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      description: "code=confirmation_required responses omit the match_request_id/status/duplicate fields.",
      properties: {
        ok: { type: "boolean" },
        code: { type: "string" },
        message: { type: "string" },
        match_request_id: { type: "string" },
        status: { type: "string" },
        duplicate: { type: "boolean" },
        pair_room_notice: { type: "string" },
      },
      required: ["ok"],
      additionalProperties: true,
    },
    annotations: WRITE_OPEN,
    handler: (input, meta) => handleSendLoveMatchRequest(input, meta) as Promise<Json>,
    summary: (result) =>
      planLine(result) ?? [result.message, result.pair_room_notice].filter(Boolean).join("\n\n"),
  },
  {
    name: "respond_to_love_match",
    title: "Respond to a Love Match",
    description:
      "Use this when the recipient wants to accept, decline, block or report a Love Match request. Only a mutual accept creates the publicly readable Pair Room.",
    inputSchema: {
      type: "object",
      properties: {
        match_request_id: { type: "string" },
        response: { type: "string", enum: ["accept", "decline", "block", "report"] },
        confirm_public_pair_room: { type: "boolean" },
        idempotency_key: { type: "string" },
      },
      required: ["match_request_id", "response"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      description: "code=confirmation_required responses omit status/room_url.",
      properties: {
        ok: { type: "boolean" },
        code: { type: "string" },
        status: { type: "string" },
        room_url: { type: ["string", "null"] },
        message: { type: "string" },
        pair_room_notice: { type: ["string", "null"] },
        next_step: { type: "string" },
      },
      required: ["ok"],
      additionalProperties: true,
    },
    annotations: DESTRUCTIVE_OPEN,
    handler: (input, meta) => handleRespondToLoveMatch(input, meta) as Promise<Json>,
    summary: (result) =>
      [result.message, result.room_url ? `Public Pair Room: ${result.room_url}` : ""]
        .filter(Boolean)
        .join("\n\n"),
  },
  {
    name: "list_love_match_requests",
    title: "My Love Match requests",
    description:
      "Use this when the user wants to see their own open and past Crawler Love match requests and their status. Read-only, never shows scores or other people's profiles.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        requests: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
        count: { type: "integer" },
      },
      required: ["ok", "requests", "count"],
      additionalProperties: false,
    },
    annotations: { ...READ_ONLY, idempotentHint: true },
    handler: (input, meta) => handleLoveMatchRequests(input, meta) as Promise<Json>,
    summary: (result) =>
      result.count
        ? (result.requests ?? [])
            .map((r: any) => `- ${r.role === "requester" ? "Sent" : "Received"} · **${r.status}** · ${r.resonance_label}`)
            .join("\n")
        : "No Crawler Love match requests.",
  },
  {
    name: "pause_love_profile",
    title: "Pause Love Profile",
    description:
      "Use this when the user wants to step out of Crawler Love matching without deleting anything. The profile is removed from new match calculations immediately.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      description: "code=no_profile responses omit the profile field.",
      properties: {
        ok: { type: "boolean" },
        code: { type: "string" },
        profile: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "active", "paused"] },
            discoverable: { type: "boolean" },
            allow_match_requests: { type: "boolean" },
            public_pair_room_consent: { type: "boolean" },
            adult_status: { type: "string", enum: ["unknown", "self_attested"] },
            activated_at: { type: ["string", "null"] },
            paused_at: { type: ["string", "null"] },
            summary: { type: "string" },
            consent_version: { type: "string" },
          },
          required: [
            "status",
            "discoverable",
            "allow_match_requests",
            "public_pair_room_consent",
            "adult_status",
            "activated_at",
            "paused_at",
            "summary",
            "consent_version",
          ],
          additionalProperties: false,
        },
        message: { type: "string" },
      },
      required: ["ok", "message"],
      additionalProperties: true,
    },
    annotations: WRITE_IDEMPOTENT,
    handler: (input, meta) => handlePauseLoveProfile(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? ""),
  },
  {
    name: "delete_love_profile",
    title: "Delete Love Profile",
    description:
      "Use this when the user wants to permanently delete their Crawler Love data: interview draft, Love summary, protected compatibility pattern, discoverability and open match requests. Always ask for an explicit confirmation first.",
    inputSchema: {
      type: "object",
      properties: { confirm: { type: "boolean", description: "The user explicitly confirmed deletion." } },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      description: "code=confirmation_required responses omit deleted.",
      properties: {
        ok: { type: "boolean" },
        code: { type: "string" },
        deleted: { type: "boolean" },
        message: { type: "string" },
      },
      required: ["ok", "message"],
      additionalProperties: true,
    },
    annotations: DESTRUCTIVE,
    handler: (input, meta) => handleDeleteLoveProfile(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? ""),
  },
];
