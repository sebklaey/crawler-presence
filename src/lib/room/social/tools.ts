/**
 * Handlers for the social profile tools.
 *
 * Posting always goes through the EXISTING message pipeline of the target room
 * (session, write permission, moderation, rate limit, retention). This module
 * adds only: provider resolution, URL safety, sensitive-contact confirmation,
 * idempotency and de-duplication.
 */
import { z } from "zod";
import { roomError } from "../errors";
import { resolveIdentity, type McpMeta } from "../identity";
import { getDb } from "../store";
import { handleSendMessage } from "../tools";
import { handleSendRoomMessage } from "../tools.personal";
import { handleSendUniversalMessage } from "../tools.plus";
import { handleSendPairMessage } from "../match/tools";
import { providerCatalog } from "./registry";
import { resolveSocialProfile, type ResolvedProfile } from "./resolve";
import {
  PUBLIC_NOTICE,
  SENSITIVE_NOTICE,
  socialMarkdown,
  socialMessageBody,
  socialStructuredContent,
} from "./card";

const resolveInput = z.object({
  provider: z.string().optional().nullable(),
  identifier: z.string().optional().nullable(),
  profile_url: z.string().optional().nullable(),
  label: z.string().optional().nullable(),
});

const roomTarget = z.object({
  type: z.enum(["universal", "topic", "personal", "pair"]),
  topic: z.string().optional().nullable(),
  username: z.string().optional().nullable(),
  room_id: z.string().optional().nullable(),
});

const postInput = resolveInput.extend({
  canonical_url: z.string().optional().nullable(),
  room_target: roomTarget.optional().nullable(),
  idempotency_key: z.string().max(120).optional().nullable(),
  sensitive_confirmation: z.boolean().optional(),
});

function profileFrom(data: z.infer<typeof resolveInput> & { canonical_url?: string | null | undefined }): ResolvedProfile {
  return resolveSocialProfile({
    provider: data.provider ?? null,
    identifier: data.identifier ?? null,
    profile_url: data.profile_url ?? data.canonical_url ?? null,
    label: data.label ?? null,
  });
}

export async function handleResolveSocialProfile(input: unknown, _meta: McpMeta) {
  const profile = profileFrom(resolveInput.parse(input ?? {}));
  return {
    ...socialStructuredContent(profile),
    requires_sensitive_confirmation: profile.requires_sensitive_confirmation,
    validation_status: "valid" as const,
    posted: false,
    notice: PUBLIC_NOTICE,
    ...(profile.requires_sensitive_confirmation ? { sensitive_notice: SENSITIVE_NOTICE } : {}),
    markdown: socialMarkdown(profile),
    _profile: profile,
  };
}

export async function handlePreviewSocialProfile(input: unknown, _meta: McpMeta) {
  const profile = profileFrom(resolveInput.parse(input ?? {}));
  return {
    ...socialStructuredContent(profile),
    posted: false,
    preview_only: true,
    notice: `Preview only — nothing has been posted yet. ${PUBLIC_NOTICE}`,
    ...(profile.requires_sensitive_confirmation ? { sensitive_notice: SENSITIVE_NOTICE } : {}),
    markdown: socialMarkdown(profile),
    _profile: profile,
  };
}

export async function handleListSocialProviders() {
  const providers = providerCatalog();
  return {
    count: providers.length,
    providers,
    fallback: "custom_social",
    notice:
      "Unbekannte Plattformen können jederzeit über custom_social mit ihrer vollständigen öffentlichen https-Profil-URL gepostet werden.",
  };
}

interface Dispatch {
  kind: string;
  ref: string | null;
  label: string;
  send: (body: string, idempotencyKey: string | null) => Promise<unknown>;
}

function dispatchFor(target: z.infer<typeof roomTarget> | null | undefined, meta: McpMeta): Dispatch {
  if (!target) {
    throw roomError("INVALID_INPUT", "Which public Crawler room should receive this social profile?");
  }
  switch (target.type) {
    case "universal":
      return {
        kind: "universal",
        ref: "universal",
        label: "Universal Room",
        send: (body, key) =>
          handleSendUniversalMessage({ text: body, ...(key ? { idempotency_key: key } : {}) }, meta),
      };
    case "topic": {
      const topic = (target.topic ?? "").trim();
      if (!topic) throw roomError("INVALID_INPUT", "Which public Crawler room should receive this social profile?");
      return {
        kind: "topic",
        ref: topic,
        label: `Themenraum ${topic}`,
        send: (body) => handleSendMessage({ topic, text: body }, meta),
      };
    }
    case "personal": {
      const username = (target.username ?? "").trim();
      if (!username) throw roomError("INVALID_INPUT", "Which public Crawler room should receive this social profile?");
      return {
        kind: "personal",
        ref: username,
        label: `${username}'s Room`,
        send: (body) => handleSendRoomMessage({ username, text: body }, meta),
      };
    }
    case "pair": {
      const slug = (target.room_id ?? "").trim();
      if (!slug) throw roomError("INVALID_INPUT", "Which public Crawler room should receive this social profile?");
      return {
        kind: "pair",
        ref: slug,
        label: "Public Match Room",
        send: (body) => handleSendPairMessage({ room_slug: slug, message: body }, meta),
      };
    }
    default:
      throw roomError("INVALID_INPUT");
  }
}

export async function handlePostSocialProfileToRoom(input: unknown, meta: McpMeta) {
  const data = postInput.parse(input ?? {});
  const profile = profileFrom(data);
  const identity = await resolveIdentity(meta);
  const db = await getDb();

  if (profile.requires_sensitive_confirmation && data.sensitive_confirmation !== true) {
    throw roomError(
      "INVALID_INPUT",
      `Nothing was posted. ${SENSITIVE_NOTICE} Bitte bestätige ausdrücklich mit "Post publicly" (sensitive_confirmation: true).`,
    );
  }

  const target = dispatchFor(data.room_target ?? null, meta);
  const idempotencyKey = data.idempotency_key?.trim() || null;

  // 1) Idempotency: the same key never creates a second post.
  if (idempotencyKey) {
    const { data: existing } = await db
      .from("social_posts")
      .select("id, created_at")
      .eq("subject_hash", identity.subjectHash)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return result(profile, target, true, PUBLIC_NOTICE);
  }

  // 2) De-duplication: the identical link in the identical room within 6h.
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: duplicate } = await db
    .from("social_posts")
    .select("id")
    .eq("subject_hash", identity.subjectHash)
    .eq("room_kind", target.kind)
    .eq("canonical_url", profile.canonical_url)
    .gte("created_at", since)
    .limit(1);
  if ((duplicate ?? []).length) return result(profile, target, true, PUBLIC_NOTICE);

  // 3) Existing pipeline of the target room decides whether this may be posted.
  const roomResult = await target.send(socialMessageBody(profile), idempotencyKey);

  await db.from("social_posts").insert({
    subject_hash: identity.subjectHash,
    room_kind: target.kind,
    room_ref: target.ref,
    provider_id: profile.provider,
    provider_label: profile.provider_label,
    display_handle: profile.display_handle,
    canonical_url: profile.canonical_url,
    preview_status: profile.preview_status,
    contains_sensitive_contact: profile.requires_sensitive_confirmation,
    idempotency_key: idempotencyKey,
  });

  return { ...result(profile, target, false, PUBLIC_NOTICE), room_result: roomResult };
}

function result(profile: ResolvedProfile, target: Dispatch, duplicate: boolean, notice: string) {
  return {
    ...socialStructuredContent(profile, { room: target.label, room_kind: target.kind }),
    posted: true,
    duplicate,
    markdown: `${socialMarkdown(profile)}\nPosted publicly in the ${target.label}.`,
    notice,
    _profile: profile,
    _room_label: target.label,
  };
}
