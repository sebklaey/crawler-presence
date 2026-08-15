/**
 * MCP tool descriptors for Crawler Match (Pro) and public pair rooms.
 */
import type { McpMeta } from "../identity";
import { CONNECTION_MODES, DIMENSION_KEYS, INTENTS } from "./config";
import {
  handleClosePairRoom,
  handleCreateResonancePattern,
  handleDeleteResonancePattern,
  handleFindMatch,
  handleGetMatchStatus,
  handleOpenPairRoom,
  handleRespondToMatch,
  handleSendPairMessage,
  handleUpdateResonancePattern,
} from "./tools";

type Json = Record<string, unknown>;

export interface MatchToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  outputSchema: Json;
  annotations: Json;
  handler: (input: unknown, meta: McpMeta) => Promise<Json>;
  summary: (result: any) => string;
}

const patternOutputSchema: Json = {
  type: "object",
  additionalProperties: true,
  properties: {
    anonymous_pattern_id: { type: "string" },
    intent: { type: "string", enum: [...INTENTS] },
    dimensions: { type: "object", additionalProperties: { type: "number" } },
    languages: { type: "array", items: { type: "string" } },
    broad_region: { type: ["string", "null"] },
    connection_modes: { type: "array", items: { type: "string", enum: [...CONNECTION_MODES] } },
    resonance_signature: { type: ["string", "null"] },
    status: { type: "string" },
    expires_at: { type: "string" },
  },
  required: [
    "anonymous_pattern_id",
    "intent",
    "dimensions",
    "languages",
    "broad_region",
    "connection_modes",
    "resonance_signature",
    "status",
    "expires_at",
  ],
};

const matchProposalSchema: Json = {
  type: "object",
  additionalProperties: true,
  properties: {
    public_match_id: { type: "string" },
    resonance: { type: "number" },
    resonance_label: { type: "string" },
    reasons: { type: "array", items: { type: "string" } },
    state: { type: "string" },
    your_status: { type: "string" },
    other_status: { type: "string" },
    expires_at: { type: "string" },
    room_url: { type: ["string", "null"] },
  },
  required: [
    "public_match_id",
    "resonance",
    "resonance_label",
    "reasons",
    "state",
    "your_status",
    "other_status",
    "expires_at",
    "room_url",
  ],
};

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false };

const patternInput: Json = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [...INTENTS],
      description: "Worum es der Person geht — keine sensiblen Kategorien.",
    },
    dimensions: {
      type: "object",
      description: `Abstrakte Werte zwischen 0 und 1. Erlaubte Schlüssel: ${DIMENSION_KEYS.join(", ")}. Mindestens vier angeben. Leite sie aus dem Gespräch ab; sende niemals Freitext.`,
      additionalProperties: { type: "number" },
    },
    languages: {
      type: "array",
      items: { type: "string" },
      description: "Zweibuchstabige Sprachcodes, z. B. [\"de\", \"en\"].",
    },
    broad_region: {
      type: "string",
      description: "Freiwillig und grob, z. B. CH oder DE. Nie Ort oder Adresse.",
    },
    connection_modes: {
      type: "array",
      items: { type: "string", enum: [...CONNECTION_MODES] },
      description: "Gewünschte Verbindungsarten.",
    },
    expires_in_days: { type: "integer", description: "Lebensdauer des Musters, Standard 30, maximal 90." },
  },
  required: ["intent", "dimensions", "languages", "connection_modes"],
  additionalProperties: false,
};

const roomSlugInput: Json = {
  type: "object",
  properties: {
    room_slug: { type: "string", description: "Slug oder vollständige URL des öffentlichen Pair Rooms." },
  },
  required: ["room_slug"],
  additionalProperties: false,
};

export const MATCH_TOOLS: MatchToolDefinition[] = [
  {
    name: "create_resonance_pattern",
    title: "Schwingungsmuster erstellen",
    description:
      "Legt ein anonymes Schwingungsmuster für Crawler Match an (Pro-Abo). Führe zuerst ein natürliches Gespräch über Interessen, Arbeitsweise und gewünschte Verbindung und leite daraus die abstrakten Dimensionen ab. Crawler speichert keine Profiltexte und keine Chatverläufe, nur die abstrakten Match-Dimensionen.",
    inputSchema: patternInput,
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        pattern: patternOutputSchema,
        notice: { type: "string" },
        message: { type: "string" },
      },
      required: ["pattern", "notice", "message"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleCreateResonancePattern(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Schwingungsmuster erstellt."),
  },
  {
    name: "update_resonance_pattern",
    title: "Schwingungsmuster aktualisieren",
    description: "Aktualisiert das eigene Schwingungsmuster (Pro-Abo).",
    inputSchema: patternInput,
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        pattern: patternOutputSchema,
        message: { type: "string" },
      },
      required: ["pattern", "message"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleUpdateResonancePattern(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Schwingungsmuster aktualisiert."),
  },
  {
    name: "delete_resonance_pattern",
    title: "Schwingungsmuster löschen",
    description: "Löscht das eigene Schwingungsmuster und alle offenen Match-Vorschläge unwiderruflich.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        deleted: { type: "boolean" },
        message: { type: "string" },
      },
      required: ["deleted", "message"],
    },
    annotations: { ...WRITE, destructiveHint: true },
    handler: (input, meta) => handleDeleteResonancePattern(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Gelöscht."),
  },
  {
    name: "find_match",
    title: "Resonanz suchen",
    description:
      "Sucht genau eine kompatible Resonanz (Pro-Abo). Es gibt keine durchsuchbare Personenliste, keine Fotos und keine Profile — nur einen Vorschlag mit Resonanzwert und unbedenklicher Begründung. Verbunden wird erst bei beidseitiger Zustimmung.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        status: { type: "string", enum: ["no_pattern", "no_candidate", "candidate_found", "pending"] },
        match: matchProposalSchema,
        message: { type: "string" },
      },
      required: ["status", "message"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleFindMatch(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Suche abgeschlossen."),
  },
  {
    name: "get_match_status",
    title: "Match-Status",
    description: "Zeigt das eigene Schwingungsmuster und alle offenen Match-Vorgänge inklusive Pair-Room-Link.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        status: { type: "string", enum: ["no_pattern", "ok"] },
        pattern: { anyOf: [patternOutputSchema, { type: "null" }] },
        matches: { type: "array", items: matchProposalSchema },
        message: { type: "string" },
      },
      required: ["status", "matches", "message"],
    },
    annotations: READ_ONLY,
    handler: (input, meta) => handleGetMatchStatus(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Status geladen."),
  },
  {
    name: "respond_to_match",
    title: "Auf Match antworten",
    description:
      "Antwortet auf einen Match-Vorschlag: accept, decline oder block. Stimmen beide zu, entsteht automatisch ein öffentlicher Pair Room.",
    inputSchema: {
      type: "object",
      properties: {
        public_match_id: { type: "string" },
        decision: { type: "string", enum: ["accept", "decline", "block"] },
      },
      required: ["public_match_id", "decision"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        state: { type: "string", enum: ["blocked", "declined", "awaiting_response", "connected"] },
        room_url: { type: ["string", "null"] },
        message: { type: "string" },
        notice: { type: "string", description: "Nur enthalten, wenn ein Pair Room entstanden ist." },
      },
      required: ["state", "room_url", "message"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleRespondToMatch(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Antwort gespeichert."),
  },
  {
    name: "open_pair_room",
    title: "Öffentlichen Pair Room öffnen",
    description:
      "Öffnet einen öffentlichen Pair Room. Jede Person kann mitlesen; schreiben dürfen nur die zwei gematchten Handles.",
    inputSchema: roomSlugInput,
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        room_slug: { type: "string" },
        room_url: { type: "string" },
        title: { type: "string" },
        participants: { type: "array", items: { type: "string" }, description: "Handles der zwei Teilnehmenden, z. B. @alice." },
        messages: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              handle: { type: "string" },
              body: { type: "string" },
              created_at: { type: "string" },
            },
            required: ["handle", "body", "created_at"],
          },
        },
        notice: { type: "string" },
      },
      required: ["room_slug", "room_url", "title", "participants", "messages", "notice"],
    },
    // Opening a pair room records membership and a read cursor — not read-only.
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    handler: (input, meta) => handleOpenPairRoom(input, meta) as Promise<Json>,
    summary: (result) => {
      const lines = [`## ${result.title} — ${result.room_url}`, String(result.notice)];
      for (const message of (result.messages ?? []) as any[]) {
        lines.push(`**${message.handle}**: ${message.body}`);
      }
      if (!((result.messages ?? []) as any[]).length) lines.push("_Noch keine Nachrichten._");
      return lines.join("\n\n");
    },
  },
  {
    name: "send_pair_message",
    title: "Im Pair Room schreiben",
    description:
      "Sendet eine Nachricht in den eigenen öffentlichen Pair Room. Nur die zwei gematchten Handles dürfen schreiben, alle können mitlesen. Nachrichten verschwinden nach 24 Stunden.",
    inputSchema: {
      type: "object",
      properties: {
        room_slug: { type: "string" },
        message: { type: "string", description: "Höchstens 500 Zeichen." },
      },
      required: ["room_slug", "message"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        room_url: { type: "string" },
        message_sent: {
          type: "object",
          additionalProperties: true,
          properties: {
            handle: { type: "string" },
            body: { type: "string" },
            created_at: { type: "string" },
          },
          required: ["handle", "body", "created_at"],
        },
        notice: { type: "string" },
      },
      required: ["room_url", "message_sent", "notice"],
    },
    annotations: WRITE,
    handler: (input, meta) => handleSendPairMessage(input, meta) as Promise<Json>,
    summary: (result) => `Gesendet — öffentlich lesbar unter ${result.room_url}`,
  },
  {
    name: "close_pair_room",
    title: "Pair Room schliessen",
    description: "Beendet das Gespräch. Der Raum bleibt öffentlich lesbar, schreiben ist nicht mehr möglich.",
    inputSchema: roomSlugInput,
    outputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        room_url: { type: "string" },
        message: { type: "string" },
      },
      required: ["room_url", "message"],
    },
    annotations: { ...WRITE, destructiveHint: true },
    handler: (input, meta) => handleClosePairRoom(input, meta) as Promise<Json>,
    summary: (result) => String(result.message ?? "Pair Room geschlossen."),
  },
];
