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

const OPEN_OUTPUT = { type: "object", additionalProperties: true } as const;

const PROFILE_PROPS = {
  provider: {
    type: "string",
    description: "Provider-ID oder Alias, z. B. instagram, x, threads, tiktok, whatsapp, custom_social.",
  },
  identifier: { type: "string", description: "Handle, Benutzername, Telefonnummer in E.164 oder Profil-URL." },
  profile_url: { type: "string", description: "Vollständige öffentliche https-Profil-URL." },
  label: { type: "string", description: "Optionaler eigener Anzeigename für benutzerdefinierte Links." },
} as const;

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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
    annotations: READ,
    handler: async () => (await handleListSocialProviders()) as unknown as Json,
    summary: (r: Json) => `${r["count"]} Plattformen bekannt (Fallback: custom_social).`,
  },
];
