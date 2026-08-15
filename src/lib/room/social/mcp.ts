/**
 * MCP tool descriptors for social profile posting.
 * Shape mirrors the other room tool modules (JSON-Schema in, summary out).
 */
import type { ResolvedProfile } from "./resolve";
import {
  SOCIAL_UI_MIME,
  SOCIAL_UI_RESOURCE,
  socialCardHtml,
} from "./card";
import {
  handleListSocialProviders,
  handlePostSocialProfileToRoom,
  handlePreviewSocialProfile,
  handleResolveSocialProfile,
} from "./tools";

type Json = Record<string, unknown>;

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

const PROFILE_PROPS = {
  provider: {
    type: "string",
    description: "Provider-ID oder Alias, z. B. instagram, x, threads, tiktok, whatsapp, custom_social.",
  },
  identifier: { type: "string", description: "Handle, Benutzername, Telefonnummer in E.164 oder Profil-URL." },
  profile_url: { type: "string", description: "Vollständige öffentliche https-Profil-URL." },
  label: { type: "string", description: "Optionaler eigener Anzeigename für benutzerdefinierte Links." },
} as const;

/* ------------------------- shared output fragments ------------------------ */

/** Fields produced by `socialStructuredContent` for every resolved profile. */
const STRUCTURED_CONTENT_PROPS: Json = {
  provider: { type: "string", description: "Provider-ID, z. B. instagram, x, custom_social." },
  provider_label: { type: "string" },
  display_handle: { type: ["string", "null"] },
  canonical_url: { type: "string" },
  preview_status: { type: "string", enum: ["basic", "public_metadata", "verified_source", "unavailable"] },
  title: { type: "string" },
  description: { type: ["string", "null"] },
  avatar_url: { type: ["string", "null"] },
  verified: { type: "boolean", enum: [false] },
  is_identity_verified: { type: "boolean", enum: [false] },
  contains_sensitive_contact: { type: "boolean" },
};

const STRUCTURED_CONTENT_REQUIRED = [
  "provider",
  "provider_label",
  "display_handle",
  "canonical_url",
  "preview_status",
  "title",
  "description",
  "avatar_url",
  "verified",
  "is_identity_verified",
  "contains_sensitive_contact",
];

/** Internal resolved-profile echo kept on the result by every handler. */
const INTERNAL_PROFILE_SCHEMA: Json = { type: "object", additionalProperties: true };

/** Fields added by `withUi` whenever `_profile` is present (always, on success). */
const UI_PROPS: Json = {
  _ui_html: { type: "string" },
  _ui_uri: { type: "string" },
  _ui_mime: { type: "string" },
};
const UI_REQUIRED = ["_ui_html", "_ui_uri", "_ui_mime"];

function withUi(result: Json, room: string | null): Json {
  const profile = result["_profile"] as ResolvedProfile | undefined;
  if (!profile) return result;
  return {
    ...result,
    _ui_html: socialCardHtml(profile, {
      room,
      postedAt: result["posted"] === true ? new Date().toISOString() : null,
      sender: null,
    }),
    _ui_uri: SOCIAL_UI_RESOURCE,
    _ui_mime: SOCIAL_UI_MIME,
  };
}

export const SOCIAL_TOOLS = [
  {
    name: "resolve_social_profile",
    title: "Social-Profil erkennen",
    description:
      "Erkennt die Plattform aus Handle, Benutzername oder Link, validiert das Format, erzeugt die kanonische öffentliche Profil-URL und meldet, ob eine ausdrückliche Bestätigung nötig ist (z. B. bei Telefonnummern). Es wird nichts gepostet.",
    inputSchema: { type: "object", properties: PROFILE_PROPS, additionalProperties: false },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        ...STRUCTURED_CONTENT_PROPS,
        requires_sensitive_confirmation: { type: "boolean" },
        validation_status: { type: "string", enum: ["valid"] },
        posted: { type: "boolean", enum: [false] },
        notice: { type: "string" },
        sensitive_notice: {
          type: "string",
          description: "Nur gesetzt, wenn requires_sensitive_confirmation true ist.",
        },
        markdown: { type: "string" },
        _profile: INTERNAL_PROFILE_SCHEMA,
        ...UI_PROPS,
      },
      required: [
        ...STRUCTURED_CONTENT_REQUIRED,
        "requires_sensitive_confirmation",
        "validation_status",
        "posted",
        "notice",
        "markdown",
        "_profile",
        ...UI_REQUIRED,
      ],
    },
    annotations: READ,
    handler: async (input: unknown, meta: Record<string, unknown> | undefined) =>
      withUi((await handleResolveSocialProfile(input, meta)) as unknown as Json, null),
    summary: (r: Json) => `${r["provider_label"]}: ${r["canonical_url"]} — noch nichts gepostet.`,
  },
  {
    name: "preview_social_profile",
    title: "Social-Profil Vorschau",
    description:
      "Zeigt eine kompakte, öffentlich unbedenkliche Vorschaukarte des Profils (Plattform, Handle, kanonischer Link) direkt im Chat. Reine Vorschau, es wird nichts veröffentlicht. Keine Identitätsprüfung.",
    inputSchema: { type: "object", properties: PROFILE_PROPS, additionalProperties: false },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        ...STRUCTURED_CONTENT_PROPS,
        posted: { type: "boolean", enum: [false] },
        preview_only: { type: "boolean", enum: [true] },
        notice: { type: "string" },
        sensitive_notice: {
          type: "string",
          description: "Nur gesetzt, wenn requires_sensitive_confirmation für das Profil true ist.",
        },
        markdown: { type: "string" },
        _profile: INTERNAL_PROFILE_SCHEMA,
        ...UI_PROPS,
      },
      required: [
        ...STRUCTURED_CONTENT_REQUIRED,
        "posted",
        "preview_only",
        "notice",
        "markdown",
        "_profile",
        ...UI_REQUIRED,
      ],
    },
    annotations: READ,
    handler: async (input: unknown, meta: Record<string, unknown> | undefined) =>
      withUi((await handlePreviewSocialProfile(input, meta)) as unknown as Json, null),
    summary: (r: Json) => `Vorschau: ${r["provider_label"]} · ${r["canonical_url"]} (noch nicht gepostet).`,
  },
  {
    name: "post_social_profile_to_room",
    title: "Social-Profil in einen Raum posten",
    description:
      "Postet ein Social-Profil als normale öffentliche Nachricht in einen Crawler-Raum (Universal Room, Themenraum, persönlicher Raum oder Public Pair Room). Alle Räume sind öffentlich lesbar. Bei Telefonnummern oder Einladungslinks ist sensitive_confirmation=true zwingend.",
    inputSchema: {
      type: "object",
      properties: {
        ...PROFILE_PROPS,
        canonical_url: { type: "string", description: "Bereits aufgelöste kanonische URL aus resolve_social_profile." },
        room_target: {
          type: "object",
          description: "Zielraum. type=universal | topic (mit topic) | personal (mit username) | pair (mit room_id).",
          properties: {
            type: { type: "string", enum: ["universal", "topic", "personal", "pair"] },
            topic: { type: "string" },
            username: { type: "string" },
            room_id: { type: "string" },
          },
          required: ["type"],
          additionalProperties: false,
        },
        idempotency_key: { type: "string", description: "Verhindert Doppel-Posts bei Wiederholungen." },
        sensitive_confirmation: {
          type: "boolean",
          description: "Ausdrückliche Zustimmung des Nutzers zur öffentlichen Veröffentlichung eines Kontaktlinks.",
        },
      },
      required: ["room_target"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        ...STRUCTURED_CONTENT_PROPS,
        room: { type: "string", description: "Anzeigename des Zielraums, z. B. 'Universal Room'." },
        room_kind: { type: "string", enum: ["universal", "topic", "personal", "pair"] },
        posted: { type: "boolean", enum: [true] },
        duplicate: {
          type: "boolean",
          description: "true, wenn der Link innerhalb von 6h bereits im selben Raum gepostet wurde oder der idempotency_key schon existiert.",
        },
        markdown: { type: "string" },
        notice: { type: "string" },
        room_result: {
          type: "object",
          additionalProperties: true,
          description: "Rückgabe der zugrunde liegenden Sende-Pipeline. Nur gesetzt, wenn tatsächlich neu gepostet wurde (duplicate: false).",
        },
        _profile: INTERNAL_PROFILE_SCHEMA,
        _room_label: { type: "string" },
        ...UI_PROPS,
      },
      required: [
        ...STRUCTURED_CONTENT_REQUIRED,
        "room",
        "room_kind",
        "posted",
        "duplicate",
        "markdown",
        "notice",
        "_profile",
        "_room_label",
        ...UI_REQUIRED,
      ],
    },
    annotations: WRITE,
    handler: async (input: unknown, meta: Record<string, unknown> | undefined) => {
      const result = (await handlePostSocialProfileToRoom(input, meta)) as unknown as Json;
      return withUi(result, (result["_room_label"] as string | undefined) ?? null);
    },
    summary: (r: Json) =>
      r["duplicate"]
        ? `Bereits gepostet — ${r["canonical_url"]} ist in ${r["room"]} schon öffentlich sichtbar.`
        : `Öffentlich gepostet in ${r["room"]}: ${r["provider_label"]} · ${r["canonical_url"]}`,
  },
  {
    name: "list_social_providers",
    title: "Unterstützte Plattformen",
    description:
      "Listet alle bekannten Social-Plattformen mit Kategorie, Aliassen und Hinweis, ob ein Handle oder eine vollständige URL erwartet wird. Unbekannte Plattformen laufen über custom_social.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        count: { type: "integer" },
        providers: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              category: { type: "string" },
              aliases: { type: "array", items: { type: "string" } },
              supports_handle: { type: "boolean" },
              supports_direct_url: { type: "boolean" },
              sensitive_identifier: { type: "boolean" },
            },
            required: [
              "id",
              "label",
              "category",
              "aliases",
              "supports_handle",
              "supports_direct_url",
              "sensitive_identifier",
            ],
          },
        },
        fallback: { type: "string", enum: ["custom_social"] },
        notice: { type: "string" },
      },
      required: ["count", "providers", "fallback", "notice"],
    },
    annotations: READ,
    handler: async () => (await handleListSocialProviders()) as unknown as Json,
    summary: (r: Json) => `${r["count"]} Plattformen bekannt (Fallback: custom_social).`,
  },
];
