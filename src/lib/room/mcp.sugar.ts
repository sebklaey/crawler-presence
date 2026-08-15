/**
 * MCP tool descriptors for Crawler Sugar — free on every plan.
 * Registered alongside the room, personal and profile tools.
 */
import type { McpMeta } from "./identity";
import { NO_VALUE_NOTICE } from "./sugar/config";
import { SUGAR_UI_MIME, SUGAR_UI_RESOURCE, sugarWidgetHtml } from "./sugar/widget";
import {
  handleGetMySugar,
  handleGetPublicSugar,
  handleListMySugarActivity,
  handlePreviewSugarGift,
  handleSendSugar,
  handleStartSugarMining,
} from "./tools.sugar";

type Json = Record<string, unknown>;

export interface SugarToolDefinition {
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

const NOTICE = "_Crawler Sugar hat keinen Geldwert und funktioniert nur in Crawler._";

function withWidget(result: any, headline: string, handle: string | null) {
  return {
    ...result,
    _ui_uri: SUGAR_UI_RESOURCE,
    _ui_mime: SUGAR_UI_MIME,
    _ui_html: sugarWidgetHtml({
      headline,
      handle,
      balance: Number(result.balance ?? 0),
      minted_all_time: Number(result.minted_all_time ?? 0),
      mining_status: result.mining_status ?? null,
      progress_percent: result.progress_percent ?? null,
      daily_minted: result.daily_minted ?? null,
      daily_cap: result.daily_cap ?? null,
      global_supply: result.global_supply ?? null,
      global_maximum_supply: result.global_maximum_supply ?? null,
    }),
  };
}

function balanceSummary(result: any): string {
  const lines = [
    `## 🍬 ${Number(result.balance ?? 0).toLocaleString()} Sugar`,
    `Minted all time: **${Number(result.minted_all_time ?? 0).toLocaleString()}**`,
  ];
  if (result.mining_status) {
    lines.push(
      `Mining: **${result.mining_status}**${
        result.paused_explanation ? ` — ${result.paused_explanation}` : ""
      } · heute ${result.daily_minted ?? 0}/${result.daily_cap ?? 0}`,
    );
  }
  if (result.minted_just_now) lines.push(`Gerade erzeugt: **+${result.minted_just_now}**`);
  if (result.global_maximum_supply) {
    lines.push(
      `Weltweit im Umlauf: ${Number(result.global_supply ?? 0).toLocaleString()} / ${Number(
        result.global_maximum_supply,
      ).toLocaleString()}`,
    );
  }
  lines.push(NOTICE);
  return lines.join("\n\n");
}

export const SUGAR_TOOLS: SugarToolDefinition[] = [
  {
    name: "get_my_sugar",
    title: "Mein Sugar",
    description:
      "Zeigt den eigenen Crawler-Sugar-Kontostand, 'Minted all time', den Mining-Status und die weltweite Umlaufmenge. Sugar ist kostenlos in jedem Abo, hat keinen Geldwert, ist keine Kryptowährung und funktioniert ausschliesslich innerhalb von Crawler.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        balance: { type: "number" },
        minted_all_time: { type: "number" },
        received_all_time: { type: "number" },
        sent_all_time: { type: "number" },
        burned_from_my_gifts: { type: "number" },
        minted_just_now: { type: "number" },
    mining_status: { type: "string" },
    lease_expires_at: { type: ["string", "null"] },
    progress_percent: { type: "number" },
    minutes_per_sugar: { type: "number" },
    daily_minted: { type: "number" },
    daily_cap: { type: "number" },
    paused_reason: { type: ["string", "null"] },
    paused_explanation: { type: ["string", "null"] },
        global_supply: { type: "number" },
        global_maximum_supply: { type: "number" },
        global_burned_all_time: { type: "number" },
    max_supply: { type: "number" },
    transfer_step: { type: "number" },
    burn_percent: { type: "number" },
    recipient_percent: { type: "number" },
    monetary_value: { type: "string", enum: ["none"] },
    no_value_notice: { type: "string" },
        display_instruction: { type: "string" },
      },
      required: [
        "balance",
        "minted_all_time",
        "received_all_time",
        "sent_all_time",
        "burned_from_my_gifts",
        "minted_just_now",
        "mining_status", "lease_expires_at", "progress_percent", "minutes_per_sugar", "daily_minted", "daily_cap", "paused_reason", "paused_explanation",
        "global_supply",
        "global_maximum_supply",
        "global_burned_all_time",
        "max_supply", "transfer_step", "burn_percent", "recipient_percent", "monetary_value", "no_value_notice",
        "display_instruction",
      ],
    },
    annotations: READ_ONLY,
    handler: async (input, meta) => withWidget(await handleGetMySugar(input, meta), "Mein Sugar", null),
    summary: balanceSummary,
  },
  {
    name: "start_sugar_mining",
    title: "Sugar-Mining starten",
    description:
      "Startet ein serverseitiges Mining-Zeitfenster von 5 Minuten. 'Mining' ist eine Metapher für aktive, echte Nutzung: pro 5 Minuten qualifizierter Aktivität entsteht 1 Sugar, begrenzt durch ein Tageslimit und die weltweite Höchstmenge. Neue Kennungen können erst nach 24 Stunden Sugar erzeugen.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
    mining_status: { type: "string" },
    lease_expires_at: { type: ["string", "null"] },
    progress_percent: { type: "number" },
    minutes_per_sugar: { type: "number" },
    daily_minted: { type: "number" },
    daily_cap: { type: "number" },
    paused_reason: { type: ["string", "null"] },
    paused_explanation: { type: ["string", "null"] },
        balance: { type: "number" },
        minted_all_time: { type: "number" },
        minted_just_now: { type: "number" },
        message: { type: "string" },
    max_supply: { type: "number" },
    transfer_step: { type: "number" },
    burn_percent: { type: "number" },
    recipient_percent: { type: "number" },
    monetary_value: { type: "string", enum: ["none"] },
    no_value_notice: { type: "string" },
      },
      required: [
        "mining_status", "lease_expires_at", "progress_percent", "minutes_per_sugar", "daily_minted", "daily_cap", "paused_reason", "paused_explanation",
        "balance",
        "minted_all_time",
        "minted_just_now",
        "message",
        "max_supply", "transfer_step", "burn_percent", "recipient_percent", "monetary_value", "no_value_notice",
      ],
    },
    annotations: WRITE,
    handler: async (input, meta) =>
      withWidget(await handleStartSugarMining(input, meta), "Sugar-Mining", null),
    summary: (result) => `${result.message}\n\n${balanceSummary(result)}`,
  },
  {
    name: "preview_sugar_gift",
    title: "Sugar-Geschenk vorschauen",
    description:
      "Zeigt vor dem Senden genau, was passiert: Betrag, Anteil für die empfangende Person (30 %), verbrannter Anteil (70 %) und der Kontostand danach. Verändert nichts und verlangt danach eine ausdrückliche Bestätigung.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "Handle der empfangenden Person, mit oder ohne @." },
        amount: { type: "integer", description: "Vielfaches von 10 (10, 20, 30 …)." },
      },
      required: ["username", "amount"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        recipient_handle: { type: "string" },
        recipient_display_name: { type: "string" },
        you_spend: { type: "number" },
        recipient_receives: { type: "number" },
        burned: { type: "number" },
        your_balance: { type: "number" },
        balance_after: { type: "number" },
        sufficient: { type: "boolean" },
        confirmation_required: { type: "boolean" },
        confirmation_token: { type: "string" },
    max_supply: { type: "number" },
    transfer_step: { type: "number" },
    burn_percent: { type: "number" },
    recipient_percent: { type: "number" },
    monetary_value: { type: "string", enum: ["none"] },
    no_value_notice: { type: "string" },
        display_instruction: { type: "string" },
      },
      required: [
        "recipient_handle",
        "recipient_display_name",
        "you_spend",
        "recipient_receives",
        "burned",
        "your_balance",
        "balance_after",
        "sufficient",
        "confirmation_required",
        "confirmation_token",
        "max_supply", "transfer_step", "burn_percent", "recipient_percent", "monetary_value", "no_value_notice",
        "display_instruction",
      ],
    },
    annotations: READ_ONLY,
    handler: (input, meta) => handlePreviewSugarGift(input, meta) as Promise<Json>,
    summary: (result) =>
      [
        `### 🍬 Geschenk an @${result.recipient_handle}`,
        `| Du gibst | @${result.recipient_handle} erhält | verbrannt |\n|---:|---:|---:|\n| **${result.you_spend}** | **${result.recipient_receives}** | **${result.burned}** |`,
        result.sufficient
          ? `Kontostand danach: **${result.balance_after}**. Bitte bestätige ausdrücklich, dann sende ich es mit send_sugar.`
          : `Dein Kontostand (${result.your_balance}) reicht dafür nicht.`,
        NOTICE,
      ].join("\n\n"),
  },
  {
    name: "send_sugar",
    title: "Sugar verschenken",
    description:
      "Verschenkt Sugar in Schritten von 10 an ein Handle. 30 % kommen an, 70 % werden dauerhaft verbrannt. Ohne confirm: true wird nur die Bestätigungsfrage zurückgegeben — es wird nichts gesendet. Sugar hat keinen Geldwert und ist nicht auszahlbar.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "Handle der empfangenden Person, mit oder ohne @." },
        amount: { type: "integer", description: "Vielfaches von 10 (10, 20, 30 …)." },
        confirm: { type: "boolean", description: "Muss true sein, nachdem die Person ausdrücklich zugestimmt hat." },
        confirmation_token: { type: "string", description: "Token aus preview_sugar_gift — verhindert doppeltes Senden." },
      },
      required: ["username", "amount"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      description:
        "Ohne confirm: true werden nur confirmation_required, you_spend und recipient_receives zurückgegeben. Nach dem Senden enthält die Antwort status, duplicate, you_spent, recipient_received und balance.",
      properties: {
        confirmation_required: { type: "boolean", description: "Nur vorhanden, solange noch nicht bestätigt wurde." },
        you_spend: { type: "number", description: "Nur in der Vorschau vor der Bestätigung." },
        recipient_receives: { type: "number", description: "Nur in der Vorschau vor der Bestätigung." },
        status: { type: "string", description: "Nur nach erfolgreichem Senden." },
        duplicate: { type: "boolean", description: "Nur nach erfolgreichem Senden." },
        you_spent: { type: "number", description: "Nur nach erfolgreichem Senden." },
        recipient_received: { type: "number", description: "Nur nach erfolgreichem Senden." },
        balance: { type: "number", description: "Nur nach erfolgreichem Senden." },
        recipient_handle: { type: "string" },
        burned: { type: "number" },
        message: { type: "string" },
    max_supply: { type: "number" },
    transfer_step: { type: "number" },
    burn_percent: { type: "number" },
    recipient_percent: { type: "number" },
    monetary_value: { type: "string", enum: ["none"] },
    no_value_notice: { type: "string" },
      },
      required: ["recipient_handle", "burned", "message", "max_supply", "transfer_step", "burn_percent", "recipient_percent", "monetary_value", "no_value_notice"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleSendSugar(input, meta) as Promise<Json>,
    summary: (result) => `${result.message}\n\n${NOTICE}`,
  },
  {
    name: "get_public_sugar",
    title: "Sugar eines Profils",
    description:
      "Zeigt die öffentlichen Sugar-Werte eines Profils: Kontostand und 'Minted all time'. Mehr ist über andere Personen nicht sichtbar.",
    inputSchema: {
      type: "object",
      properties: { username: { type: "string" } },
      required: ["username"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        handle: { type: "string" },
        display_name: { type: "string" },
        balance: { type: "number" },
        minted_all_time: { type: "number" },
    max_supply: { type: "number" },
    transfer_step: { type: "number" },
    burn_percent: { type: "number" },
    recipient_percent: { type: "number" },
    monetary_value: { type: "string", enum: ["none"] },
    no_value_notice: { type: "string" },
        display_instruction: { type: "string" },
      },
      required: [
        "handle",
        "display_name",
        "balance",
        "minted_all_time",
        "max_supply", "transfer_step", "burn_percent", "recipient_percent", "monetary_value", "no_value_notice",
        "display_instruction",
      ],
    },
    annotations: READ_ONLY,
    handler: async (input, meta) => {
      const result = await handleGetPublicSugar(input, meta);
      return withWidget(result, "Sugar", String(result.handle));
    },
    summary: (result) =>
      `### 🍬 @${result.handle}\n\n**${Number(result.balance).toLocaleString()} Sugar** · Minted all time: **${Number(
        result.minted_all_time,
      ).toLocaleString()}**\n\n${NOTICE}`,
  },
  {
    name: "list_my_sugar_activity",
    title: "Meine Sugar-Bewegungen",
    description:
      "Listet die letzten eigenen Sugar-Ereignisse aus dem manipulationssicheren Journal: erzeugt (MINT), gesendet (TRANSFER_OUT), erhalten (TRANSFER_IN) und verbrannt (BURN).",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", description: "1–50, Standard 20." } },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        balance: { type: "number" },
        minted_all_time: { type: "number" },
        events: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              type: { type: "string", description: "MINT, TRANSFER_OUT, TRANSFER_IN oder BURN." },
              amount: { type: "number" },
              created_at: { type: "string" },
              source_action: { type: ["string", "null"] },
            },
            required: ["type", "amount", "created_at", "source_action"],
          },
        },
        transfer_step: { type: "number" },
        no_value_notice: { type: "string" },
      },
      required: ["balance", "minted_all_time", "events", "transfer_step", "no_value_notice"],
    },
    annotations: READ_ONLY,
    handler: (input, meta) => handleListMySugarActivity(input, meta) as Promise<Json>,
    summary: (result) => {
      const events = (result.events ?? []) as any[];
      const body = events.length
        ? events
            .map((e) => `- ${String(e.created_at).slice(0, 16).replace("T", " ")} · **${e.type}** ${e.amount}`)
            .join("\n")
        : "_Noch keine Sugar-Bewegungen._";
      return `### 🍬 Sugar-Bewegungen\n\nKontostand: **${result.balance}** · Minted all time: **${result.minted_all_time}**\n\n${body}\n\n${NOTICE}`;
    },
  },
];

export const SUGAR_INSTRUCTION = NO_VALUE_NOTICE;
