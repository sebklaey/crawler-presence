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

const OPEN_OUTPUT: Json = { type: "object", additionalProperties: true };
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
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
    outputSchema: OPEN_OUTPUT,
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
