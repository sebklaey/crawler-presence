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

const OPEN_OUTPUT: Json = { type: "object", additionalProperties: true };

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
    outputSchema: OPEN_OUTPUT,
    annotations: READ_ONLY,
    handler: (input, meta) => handleGetMyPlan(input, meta) as Promise<Json>,
    summary: (result) => String(result.notice ?? "Plan geladen."),
  },

  {
    name: "create_public_room",
    title: "Öffentlichen Raum erstellen",
    description:
      "Erstellt einen eigenen, öffentlich lesbaren Raum. In Crawler Room gibt es keine privaten Räume und keine privaten Nachrichten — jeder Raum ist öffentlich lesbar. Limits für Kapazität und Anzahl Räume werden serverseitig geprüft.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        topic: { type: "string" },
        visibility: { type: "string", enum: ["public"], description: "Immer public. Private Räume gibt es nicht." },
        capacity: { type: "integer" },
        organization_id: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
    annotations: WRITE,
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
    outputSchema: OPEN_OUTPUT,
    annotations: WRITE,
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
    outputSchema: OPEN_OUTPUT,
    annotations: WRITE,
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
    outputSchema: OPEN_OUTPUT,
    annotations: WRITE,
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
    outputSchema: OPEN_OUTPUT,
    annotations: WRITE,
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
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
    outputSchema: OPEN_OUTPUT,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
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
    outputSchema: OPEN_OUTPUT,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
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
    outputSchema: OPEN_OUTPUT,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input, meta) => handleBlockAdvertiser(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Werbekunde blockiert."),
  },
];
