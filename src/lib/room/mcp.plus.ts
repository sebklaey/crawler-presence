/**
 * MCP tool descriptors for plans, owned rooms, the Universal Room and
 * advertising. Registered alongside the core chat tools in `mcp.ts`.
 */
import type { McpMeta } from "./identity";
import {
  handleAddCampaignCreative,
  handleAdminReviewCampaign,
  handleBlockAdvertiser,
  handlePreviewSponsoredCampaign,
  handleSetResonanceAdsPreference,
  handleCreateInvitation,
  handleCreatePublicRoom,
  handleCreateSponsoredCampaign,
  handleEnterUniversal,
  handleGetCampaignAnalytics,
  handleGetMyPlan,
  handleHideSponsoredPlacement,
  handleJoinInvitation,
  handleListUniversal,
  handleManageCampaign,
  handleManageRoom,
  handleReportSponsoredPlacement,
  handleSendUniversalMessage,
  handleSubmitCampaignForReview,
} from "./tools.plus";

type Json = Record<string, unknown>;

export interface PlusToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  outputSchema: Json;
  annotations: Json;
  handler: (input: unknown, meta: McpMeta) => Promise<Json>;
  summary: (result: any) => string;
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
};
const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
  idempotentHint: false,
};

const UNIVERSAL_MESSAGE_SCHEMA: Json = {
  type: "object",
  properties: {
    id: { type: "string" },
    alias: { type: "string" },
    text: { type: "string" },
    created_at: { type: "string" },
    is_self: { type: "boolean" },
  },
  required: ["id", "alias", "text", "created_at", "is_self"],
};

const FEED_IMAGE_SCHEMA: Json = {
  type: "object",
  properties: {
    id: { type: "string" },
    alias: { type: "string" },
    created_at: { type: "string" },
    alt_text: { type: "string" },
    width: { type: "number" },
    height: { type: "number" },
    status: { type: "string" },
    is_self: { type: "boolean" },
    url: { type: "string" },
    note: { type: "string" },
  },
  required: ["id", "alias", "created_at", "alt_text", "width", "height", "status", "is_self", "url", "note"],
};

const UNIVERSAL_FEED_PROPERTIES: Json = {
  room: {
    type: "object",
    properties: {
      label: { type: "string" },
      presence: { type: "string" },
      approximate_online: { type: "number" },
      online_now: { type: "number" },
      presence_window_seconds: { type: "number" },
      presence_checked_at: { type: "string" },
    },
    required: [
      "label",
      "presence",
      "approximate_online",
      "online_now",
      "presence_window_seconds",
      "presence_checked_at",
    ],
  },
  messages: { type: "array", items: UNIVERSAL_MESSAGE_SCHEMA },
  images: { type: "array", items: FEED_IMAGE_SCHEMA },
  my_pending_images: { type: "array", items: FEED_IMAGE_SCHEMA },
  next_cursor: { type: ["string", "null"], description: "Cursor for the next page, or null when there is none." },
  has_more: { type: "boolean" },
  trending_topics: {
    type: "array",
    items: {
      type: "object",
      properties: {
        slug: { type: "string" },
        display_name: { type: "string" },
        count: { type: "number" },
      },
      required: ["slug", "display_name", "count"],
    },
  },
  active_rooms: {
    type: "array",
    items: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        capacity: { type: "number" },
      },
      required: ["title", "description", "capacity"],
    },
  },
  upcoming_events: { type: "array", items: { type: "object", additionalProperties: true } },
  sponsored: {
    type: "array",
    description: "Sponsored Room cards and/or resonance-matched Crawler Ad placements, always disclosed.",
    items: { type: "object", additionalProperties: true },
  },
  sponsored_disclosure: { type: "string" },
  notice: { type: "string" },
};

const UNIVERSAL_FEED_REQUIRED = [
  "room",
  "messages",
  "images",
  "my_pending_images",
  "next_cursor",
  "has_more",
  "trending_topics",
  "active_rooms",
  "upcoming_events",
  "sponsored",
  "sponsored_disclosure",
  "notice",
];

const AD_KNOWLEDGE_CORE_SCHEMA: Json = {
  type: "object",
  properties: {
    schema_version: { type: "string" },
    content_type: { type: "string", enum: ["sponsored_knowledge"] },
    ad_id: { type: "string" },
    campaign_id: { type: "string" },
    advertiser: {
      type: "object",
      properties: {
        name: { type: "string" },
        crawler_presence_url: { type: ["string", "null"] },
      },
      required: ["name", "crawler_presence_url"],
    },
    product: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        category: { type: ["string", "null"] },
      },
      required: ["name", "description", "category"],
    },
    creative: {
      type: "object",
      properties: {
        headline: { type: "string" },
        body: { type: "string" },
        image_url: { type: ["string", "null"] },
        image_alt: { type: ["string", "null"] },
        call_to_action: { type: "string" },
        destination_url: { type: "string" },
      },
      required: ["headline", "body", "image_url", "image_alt", "call_to_action", "destination_url"],
    },
    advertiser_claims: { type: "array", items: { type: "string" } },
    marketing_narrative: { type: "string" },
    disclosure: {
      type: "object",
      properties: {
        sponsored: { type: "boolean", enum: [true] },
        label: { type: "string" },
        matching: { type: "string" },
      },
      required: ["sponsored", "label", "matching"],
    },
    status: { type: "string" },
    published_at: { type: ["string", "null"] },
    updated_at: { type: "string" },
  },
  required: [
    "schema_version",
    "content_type",
    "ad_id",
    "campaign_id",
    "advertiser",
    "product",
    "creative",
    "advertiser_claims",
    "marketing_narrative",
    "disclosure",
    "status",
    "published_at",
    "updated_at",
  ],
};

function feedSummary(result: any): string {
  const messages = (result.messages ?? []) as Array<{ alias: string; text: string }>;
  const head = `Universal Room — ${result.room?.presence ?? "öffentlich"}.`;
  const body = messages.length
    ? `\n\n${messages.map((m) => `• ${m.alias}: ${m.text}`).join("\n")}`
    : "\n\nNoch keine Nachrichten im sichtbaren Zeitfenster.";
  const sponsored = (result.sponsored ?? []) as Array<{ title: string; organization: string }>;
  const ads = sponsored.length
    ? `\n\nAnzeige (Gesponserter Raum): ${sponsored.map((s) => `${s.title} — ${s.organization}`).join(" · ")}`
    : "";
  return head + body + ads;
}

export const PLUS_TOOLS: PlusToolDefinition[] = [
  {
    name: "get_my_plan",
    title: "Mein Abo und meine Möglichkeiten",
    description:
      "Zeigt das aktive Crawler-Abo, die freigeschalteten Erweiterungen, Limits, die Nutzung und die gesperrten Funktionen mit dem nötigen Plan. Öffentliche Themenräume und der Universal Room sind gratis; eigene Räume gehören zu Plus ($5/Monat), Communities zu Pro ($20/Monat), Organisationen zu Business ($80/Monat) — direkt über die checkout_urls/upgrade_url aus der Antwort buchbar (Paddle-Checkout). Mit recovery_code wird ein bezahltes Presence-Abo mit dieser anonymen Kennung verknüpft.",
    inputSchema: {
      type: "object",
      properties: {
        recovery_code: {
          type: "string",
          description: "Presence-Wiederherstellungscode (<slug>~<secret>), um ein bezahltes Abo freizuschalten.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        plan: { type: "string" },
        plan_name: { type: "string" },
        price_usd: { type: "number" },
        linked_presence: { type: ["string", "null"] },
        link_error: { type: ["string", "null"] },
        session_id_checked: { type: "boolean" },
        session_plan: { type: ["string", "null"] },
        session_link_error: { type: ["string", "null"] },
        features: { type: "object", additionalProperties: { type: "boolean" } },
        limits: { type: "object", additionalProperties: { type: "number" } },
        usage: {
          type: "object",
          properties: {
            owned_rooms: { type: "number" },
            active_memberships: { type: "number" },
            organizations: { type: "number" },
          },
          required: ["owned_rooms", "active_memberships", "organizations"],
        },
        locked: {
          type: "array",
          items: {
            type: "object",
            properties: {
              feature: { type: "string" },
              feature_label: { type: "string" },
              included: { type: "boolean", enum: [false] },
              required_plan: { type: ["string", "null"] },
              price_usd: { type: ["number", "null"] },
              upgrade_url: { type: "string" },
            },
            required: ["feature", "feature_label", "included", "required_plan", "price_usd", "upgrade_url"],
          },
        },
        upgrade_url: { type: "string" },
        checkout_urls: {
          type: "object",
          properties: {
            plus: { type: "string" },
            pro: { type: "string" },
            business: { type: "string" },
          },
          required: ["plus", "pro", "business"],
        },
        notice: { type: "string" },
      },
      required: [
        "plan",
        "plan_name",
        "price_usd",
        "linked_presence",
        "link_error",
        "session_id_checked",
        "session_plan",
        "session_link_error",
        "features",
        "limits",
        "usage",
        "locked",
        "upgrade_url",
        "checkout_urls",
        "notice",
      ],
    },
    annotations: READ_ONLY,
    handler: (input, meta) => handleGetMyPlan(input, meta) as Promise<Json>,
    summary: (result) => String(result.notice ?? "Plan geladen."),
  },

  {
    name: "create_public_room",
    title: "Öffentlichen Raum erstellen",
    description:
      "Erstellt einen eigenen, öffentlich lesbaren Raum. Mit kind=\"community\" wird ein Community-Raum erstellt (Pro/Business); eine passende Organisation wird bei Bedarf automatisch angelegt. In Crawler Room gibt es keine privaten Räume und keine privaten Nachrichten. Limits werden serverseitig geprüft.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        topic: { type: "string" },
        visibility: { type: "string", enum: ["public"], description: "Immer public. Private Räume gibt es nicht." },
        capacity: { type: "integer" },
        kind: { type: "string", enum: ["room", "community"], description: "community benötigt Pro oder Business." },
        organization_id: { type: "string", description: "Bestehende Organisation: UUID, Slug oder exakter Name." },
        organization_name: { type: "string", description: "Name einer neuen Organisation für die Community." },
      },
      required: ["title"],
      additionalProperties: false,
    },

    outputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string" },
        title: { type: "string" },
        kind: { type: "string", enum: ["room", "community"] },
        organization_id: { type: ["string", "null"] },
        visibility: { type: "string", enum: ["public"] },
        capacity: { type: "number" },
        retention: {
          type: "object",
          properties: {
            texts: { type: ["number", "null"] },
            images: { type: ["number", "null"] },
          },
          required: ["texts", "images"],
        },
        invitation_token: { type: ["string", "null"] },
        message: { type: "string" },
      },
      required: [
        "room_id",
        "title",
        "kind",
        "organization_id",
        "visibility",
        "capacity",
        "retention",
        "invitation_token",
        "message",
      ],
    },
    annotations: WRITE,
    handler: (input, meta) => handleCreatePublicRoom(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Raum erstellt."),
  },
  {
    name: "manage_room",
    title: "Raum verwalten",
    description:
      "Verwaltet einen eigenen Raum: update, archive, delete, update_retention, assign_moderator, remove_moderator. Räume sind immer öffentlich.",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string" },
        action: {
          type: "string",
          enum: [
            "update",
            "archive",
            "delete",
            "update_retention",
            "assign_moderator",
            "remove_moderator",
          ],
        },
        payload: { type: "object", additionalProperties: true },
      },
      required: ["room_id", "action"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["update", "archive", "delete", "update_retention", "assign_moderator", "remove_moderator"],
        },
        room_id: { type: "string" },
        message: { type: "string" },
      },
      required: ["action", "room_id", "message"],
    },
    annotations: { ...WRITE, destructiveHint: true },
    handler: (input, meta) => handleManageRoom(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Raum aktualisiert."),
  },
  {
    name: "create_invitation",
    title: "Einladung erstellen",
    description:
      "Erstellt eine sichere, widerrufbare Einladung für einen eigenen Raum. Mit 'revoke_token' wird eine Einladung widerrufen.",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string" },
        expires_in_hours: { type: "integer" },
        max_uses: { type: "integer" },
        revoke_token: { type: "string" },
      },
      required: ["room_id"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      description: "Either a revocation result (revoked, message) or a new invitation (invitation_token, expires_at, max_uses, message).",
      properties: {
        revoked: { type: "boolean", enum: [true] },
        invitation_token: { type: "string" },
        expires_at: { type: ["string", "null"] },
        max_uses: { type: ["number", "null"] },
        message: { type: "string" },
      },
      required: ["message"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleCreateInvitation(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Einladung erstellt."),
  },
  {
    name: "join_invitation",
    title: "Einladung einlösen",
    description: "Tritt einem Raum über einen Einladungscode bei.",
    inputSchema: {
      type: "object",
      properties: { invitation_token: { type: "string" } },
      required: ["invitation_token"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string" },
        title: { type: "string" },
        alias: { type: "string" },
        joined_now: { type: "boolean" },
        message: { type: "string" },
      },
      required: ["room_id", "title", "alias", "joined_now", "message"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleJoinInvitation(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Beigetreten."),
  },
  {
    name: "enter_universal",
    title: "Universal Room betreten",
    description:
      "Betritt den globalen öffentlichen Universal Room und liefert den aktuellen öffentlichen Zustand. Erzeugt keine doppelten Mitgliedschaften.",
    inputSchema: {
      type: "object",
      properties: { alias: { type: "string" } },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        joined_now: { type: "boolean" },
        alias: { type: "string" },
        presence: { type: "string" },
        online_now: { type: "number" },
        ...UNIVERSAL_FEED_PROPERTIES,
      },
      required: ["joined_now", "alias", "presence", "online_now", ...UNIVERSAL_FEED_REQUIRED],
    },
    annotations: { ...WRITE, idempotentHint: true },
    handler: (input, meta) => handleEnterUniversal(input, meta) as Promise<Json>,
    summary: feedSummary,
  },
  {
    name: "list_universal",
    title: "Universal Room lesen",
    description:
      "Liefert öffentliche Nachrichten (mit Cursor-Pagination), Trend-Themen, aktive öffentliche Räume, kommende Events und freigegebene gesponserte Karten.",
    inputSchema: {
      type: "object",
      properties: {
        cursor: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        topic: { type: "string" },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { ...UNIVERSAL_FEED_PROPERTIES },
      required: [...UNIVERSAL_FEED_REQUIRED],
    },
    annotations: { ...READ_ONLY, readOnlyHint: false },
    handler: (input, meta) => handleListUniversal(input, meta) as Promise<Json>,
    summary: feedSummary,
  },
  {
    name: "send_universal_message",
    title: "Im Universal Room schreiben",
    description:
      "Sendet eine normale Nachricht in den Universal Room. Rate-Limits, Spam-Schutz und ein optionaler Idempotenz-Schlüssel gelten serverseitig.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" }, idempotency_key: { type: "string" } },
      required: ["text"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        sent: { type: "boolean", enum: [true] },
        duplicate: { type: "boolean" },
        sent_message: UNIVERSAL_MESSAGE_SCHEMA,
        ...UNIVERSAL_FEED_PROPERTIES,
      },
      required: ["sent", "duplicate", "sent_message", ...UNIVERSAL_FEED_REQUIRED],
    },
    annotations: WRITE,
    handler: (input, meta) => handleSendUniversalMessage(input, meta) as Promise<Json>,
    summary: feedSummary,
  },
  {
    name: "hide_sponsored_placement",
    title: "Anzeige ausblenden",
    description: "Blendet eine gesponserte Karte für diese Person dauerhaft aus.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      required: ["campaign_id"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        hidden: { type: "boolean", enum: [true] },
        message: { type: "string" },
      },
      required: ["hidden", "message"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    handler: (input, meta) => handleHideSponsoredPlacement(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Anzeige ausgeblendet."),
  },
  {
    name: "report_sponsored_placement",
    title: "Anzeige melden",
    description: "Meldet eine gesponserte Karte zur Prüfung.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        reason: {
          type: "string",
          enum: ["spam", "misleading", "offensive", "scam", "irrelevant", "other"],
        },
      },
      required: ["campaign_id", "reason"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        reported: { type: "boolean", enum: [true] },
        message: { type: "string" },
      },
      required: ["reported", "message"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    handler: (input, meta) => handleReportSponsoredPlacement(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Gemeldet."),
  },
  {
    name: "create_sponsored_campaign",
    title: "Gesponserten Raum anlegen",
    description:
      "Nur für Business-Organisationen: legt eine Kampagne als Entwurf an. Kampagnen werden nie automatisch veröffentlicht.",
    inputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        topics: { type: "array", items: { type: "string" } },
        cover_image_reference: { type: "string" },
        call_to_action: { type: "string" },
        destination_url: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
        budget_cents: { type: "integer" },
        languages: { type: "array", items: { type: "string" } },
      },
      required: ["organization_id", "title", "description", "topics"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        status: { type: "string", enum: ["draft"] },
        policy_ok: { type: "boolean" },
        policy_violations: { type: "array", items: { type: "string" } },
        message: { type: "string" },
      },
      required: ["campaign_id", "status", "policy_ok", "policy_violations", "message"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    handler: (input, meta) => handleCreateSponsoredCampaign(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Kampagne erstellt."),
  },
  {
    name: "submit_campaign_for_review",
    title: "Kampagne einreichen",
    description:
      "Reicht eine Kampagne zur Prüfung ein. Geprüft werden verifizierte Organisation, Vollständigkeit, Richtlinien und Zielseite.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      required: ["campaign_id"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending_review"] },
        message: { type: "string" },
      },
      required: ["status", "message"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    handler: (input, meta) => handleSubmitCampaignForReview(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Eingereicht."),
  },
  {
    name: "manage_campaign",
    title: "Kampagne verwalten",
    description: "Aktionen: update, pause, resume, cancel. Inhaltliche Änderungen erfordern eine neue Prüfung.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        action: { type: "string", enum: ["update", "pause", "resume", "cancel"] },
        payload: { type: "object", additionalProperties: true },
      },
      required: ["campaign_id", "action"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        action: { type: "string", enum: ["update", "pause", "resume", "cancel"] },
        message: { type: "string" },
      },
      required: ["campaign_id", "action", "message"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    handler: (input, meta) => handleManageCampaign(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Kampagne aktualisiert."),
  },
  {
    name: "get_campaign_analytics",
    title: "Kampagnen-Auswertung",
    description:
      "Aggregierte, datenschutzsichere Auswertung der eigenen Kampagnen. Keine Einzelprofile, keine Gesprächsinhalte.",
    inputSchema: {
      type: "object",
      properties: { organization_id: { type: "string" } },
      required: ["organization_id"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        organization_id: { type: "string" },
        campaigns: {
          type: "array",
          description: "Per-room-entry campaign analytics.",
          items: {
            type: "object",
            properties: {
              campaign_id: { type: "string" },
              title: { type: "string" },
              status: { type: "string" },
              aggregated: { type: "boolean" },
              impressions: { type: ["number", "null"] },
              room_entries: { type: ["number", "null"] },
              cta_clicks: { type: ["number", "null"] },
              event_signups: { type: ["number", "null"] },
              hide_rate: { type: ["number", "null"] },
              report_rate: { type: ["number", "null"] },
              spend_cents: { type: "number" },
              cost_per_entry_cents: { type: ["number", "null"] },
              note: { type: ["string", "null"] },
            },
            required: [
              "campaign_id",
              "title",
              "status",
              "aggregated",
              "impressions",
              "room_entries",
              "cta_clicks",
              "event_signups",
              "hide_rate",
              "report_rate",
              "spend_cents",
              "cost_per_entry_cents",
              "note",
            ],
          },
        },
        crawler_ads: {
          type: "object",
          properties: {
            campaigns: {
              type: "array",
              description: "Per-creative Crawler Ads analytics.",
              items: {
                type: "object",
                properties: {
                  campaign_id: { type: "string" },
                  title: { type: "string" },
                  status: { type: "string" },
                  creatives: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        creative_id: { type: "string" },
                        product_name: { type: "string" },
                        status: { type: "string" },
                        impressions: { type: "number" },
                        unique_impressions: { type: ["number", "null"] },
                        clicks: { type: "number" },
                        click_through_rate: { type: ["number", "null"] },
                        hidden: { type: "number" },
                        reported: { type: "number" },
                        resonance_band: { type: ["string", "null"] },
                        by_language: {
                          type: ["array", "null"],
                          items: {
                            type: "object",
                            properties: { language: { type: "string" }, impressions: { type: "number" } },
                            required: ["language", "impressions"],
                          },
                        },
                        by_day: {
                          type: ["array", "null"],
                          items: {
                            type: "object",
                            properties: { day: { type: "string" }, impressions: { type: "number" } },
                            required: ["day", "impressions"],
                          },
                        },
                        segment_note: { type: ["string", "null"] },
                      },
                      required: [
                        "creative_id",
                        "product_name",
                        "status",
                        "impressions",
                        "unique_impressions",
                        "clicks",
                        "click_through_rate",
                        "hidden",
                        "reported",
                        "resonance_band",
                        "by_language",
                        "by_day",
                        "segment_note",
                      ],
                    },
                  },
                },
                required: ["campaign_id", "title", "status", "creatives"],
              },
            },
            privacy_note: { type: "string" },
          },
          required: ["campaigns", "privacy_note"],
        },
      },
      required: ["organization_id", "campaigns", "crawler_ads"],
    },
    annotations: READ_ONLY,
    handler: (input, meta) => handleGetCampaignAnalytics(input, meta) as Promise<Json>,
    summary: (result) => `Kampagnen: ${(result.campaigns ?? []).length}.`,
  },
  {
    name: "admin_review_campaign",
    title: "Kampagne prüfen (Plattform)",
    description:
      "Nur für Plattform-Administration: approve, reject, request_changes oder suspend. Jede Entscheidung wird protokolliert.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        action: { type: "string", enum: ["approve", "reject", "request_changes", "suspend"] },
        reason: { type: "string" },
      },
      required: ["campaign_id", "action"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        status: { type: "string", enum: ["approved", "rejected", "draft", "suspended"] },
        message: { type: "string" },
      },
      required: ["campaign_id", "status", "message"],
    },
    annotations: { ...WRITE, destructiveHint: true },
    handler: (input, meta) => handleAdminReviewCampaign(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Geprüft."),
  },
  {
    name: "add_campaign_creative",
    title: "Crawler Ad Creative hinzufügen",
    description:
      "Crawler Ads (nur Business): fügt einer Kampagne ein Creative für genau ein Produkt hinzu. Jedes Creative erhält einen eigenen, klar gekennzeichneten Ad Knowledge Core und ein eigenes anonymes Ad Resonance Pattern. Wird niemals automatisch veröffentlicht.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        product_name: { type: "string" },
        product_description: { type: "string" },
        product_category: { type: "string" },
        product_reference: { type: "string" },
        headline: { type: "string" },
        body: { type: "string" },
        image_reference: { type: "string" },
        image_alt: { type: "string", description: "Pflicht, sobald ein Bild verwendet wird." },
        destination_url: { type: "string", description: "Öffentliche HTTPS-URL." },
        call_to_action: { type: "string" },
        languages: { type: "array", items: { type: "string" } },
        start_date: { type: "string" },
        end_date: { type: "string" },
      },
      required: ["campaign_id", "product_name", "headline", "body", "destination_url"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        creative_id: { type: "string" },
        campaign_id: { type: "string" },
        status: { type: "string", enum: ["draft"] },
        knowledge_slug: { type: "string" },
        message: { type: "string" },
      },
      required: ["creative_id", "campaign_id", "status", "knowledge_slug", "message"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    handler: (input, meta) => handleAddCampaignCreative(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Creative angelegt."),
  },
  {
    name: "preview_sponsored_campaign",
    title: "Crawler Ad Vorschau",
    description:
      "Zeigt für jede Anzeige einer Kampagne den Ad Knowledge Core, die Sponsored Card und eine Vorschau des Resonanzmusters. Veröffentlicht nichts.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      required: ["campaign_id"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        campaign_status: { type: "string" },
        advertiser: { type: "string" },
        creatives: {
          type: "array",
          items: {
            type: "object",
            properties: {
              creative_id: { type: "string" },
              status: { type: "string" },
              needs_new_review: { type: "boolean" },
              ad_knowledge_core: AD_KNOWLEDGE_CORE_SCHEMA,
              ad_knowledge_paths: {
                type: "object",
                properties: {
                  page: { type: "string" },
                  markdown: { type: "string" },
                  json: { type: "string" },
                },
                required: ["page", "markdown", "json"],
              },
              sponsored_card: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  advertiser: { type: "string" },
                  product: { type: "string" },
                  headline: { type: "string" },
                  body: { type: "string" },
                  image_alt: { type: ["string", "null"] },
                  call_to_action: { type: "string" },
                  destination_domain: { type: "string" },
                },
                required: [
                  "label",
                  "advertiser",
                  "product",
                  "headline",
                  "body",
                  "image_alt",
                  "call_to_action",
                  "destination_domain",
                ],
              },
              ad_resonance_pattern: {
                type: "object",
                properties: {
                  schema_version: { type: "string" },
                  creative_id: { type: "string" },
                  dimensions: { type: "object", additionalProperties: { type: "number" } },
                  intents: { type: "array", items: { type: "string" } },
                  languages: { type: "array", items: { type: "string" } },
                  created_from_approved_content: { type: "boolean" },
                  version: { type: "number" },
                },
                required: [
                  "schema_version",
                  "creative_id",
                  "dimensions",
                  "intents",
                  "languages",
                  "created_from_approved_content",
                  "version",
                ],
              },
            },
            required: [
              "creative_id",
              "status",
              "needs_new_review",
              "ad_knowledge_core",
              "ad_knowledge_paths",
              "sponsored_card",
              "ad_resonance_pattern",
            ],
          },
        },
        published: { type: "boolean", enum: [false] },
        note: { type: "string" },
      },
      required: ["campaign_id", "campaign_status", "advertiser", "creatives", "published", "note"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    handler: (input, meta) => handlePreviewSponsoredCampaign(input, meta) as Promise<Json>,
    summary: (result) => `Vorschau: ${(result.creatives ?? []).length} Creative(s). Nichts veröffentlicht.`,
  },
  {
    name: "set_resonance_ads_preference",
    title: "Resonance Ads ein- oder ausschalten",
    description:
      "Legt fest, ob das freiwillig erstellte Resonanzmuster zusätzlich für gesponserte Empfehlungen verwendet werden darf. Standard ist aus. Das Muster wird dabei nie gelöscht und Crawler Match bleibt unabhängig davon aktiv.",
    inputSchema: {
      type: "object",
      properties: { enabled: { type: "boolean" } },
      required: ["enabled"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        message: { type: "string" },
        note: { type: "string" },
      },
      required: ["enabled", "message", "note"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    handler: (input, meta) => handleSetResonanceAdsPreference(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Einstellung gespeichert."),
  },
  {
    name: "block_advertiser",
    title: "Werbekunden blockieren",
    description: "Blockiert alle gesponserten Karten dieses Werbekunden für diese anonyme Identität.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      required: ["campaign_id"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        blocked: { type: "boolean", enum: [true] },
        message: { type: "string" },
      },
      required: ["blocked", "message"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    handler: (input, meta) => handleBlockAdvertiser(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Werbekunde blockiert."),
  },
];
