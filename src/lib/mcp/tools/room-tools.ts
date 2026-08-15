/**
 * Adapter that registers the full Room chat tool set inside Crawler's /mcp endpoint.
 *
 * The Room library exposes JSON-Schema tool descriptors; Crawler's MCP SDK expects
 * raw zod shapes. This module converts them and threads Crawler's accountless
 * `room_token` (an opaque capability string) through as the pseudonymous identity.
 */
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { TOOLS } from "@/lib/room/mcp";
import { PERSONAL_TOOLS } from "@/lib/room/mcp.personal";
import { PLUS_TOOLS } from "@/lib/room/mcp.plus";
import { PROFILE_TOOLS } from "@/lib/room/mcp.profile";
import { SUGAR_TOOLS } from "@/lib/room/mcp.sugar";
import { LOVE_TOOLS } from "@/lib/room/mcp.love";
import { MATCH_TOOLS } from "@/lib/room/match/mcp";
import { SOCIAL_TOOLS } from "@/lib/room/social/mcp";
import { toRoomError } from "@/lib/room/errors";

type Json = Record<string, unknown>;

interface RoomTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  outputSchema?: Json;
  annotations: Json;
  handler: (input: unknown, meta: Record<string, unknown> | undefined) => Promise<Json>;
  summary: (result: any) => string;
}

function leafSchema(node: Json): z.ZodTypeAny {
  const type = node["type"];
  if (Array.isArray(node["enum"]) && node["enum"].every((v) => typeof v === "string")) {
    return z.string();
  }
  switch (type) {
    case "string":
      return z.string();
    case "integer":
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array": {
      const items = (node["items"] as Json | undefined) ?? {};
      return z.array(leafSchema(items));
    }
    case "object": {
      const props = (node["properties"] as Record<string, Json> | undefined) ?? {};
      const required = (node["required"] as string[] | undefined) ?? [];
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, value] of Object.entries(props)) {
        const inner = leafSchema(value);
        shape[key] = required.includes(key) ? inner : inner.optional();
      }
      return Object.keys(shape).length ? z.object(shape).passthrough() : z.record(z.any());
    }
    default:
      return z.any();
  }
}

function toShape(schema: Json): Record<string, z.ZodTypeAny> {
  const props = (schema["properties"] as Record<string, Json> | undefined) ?? {};
  const required = (schema["required"] as string[] | undefined) ?? [];
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, value] of Object.entries(props)) {
    const inner = leafSchema(value);
    const described =
      typeof value["description"] === "string"
        ? inner.describe(value["description"] as string)
        : inner;
    shape[key] = required.includes(key) ? described : described.optional();
  }
  return shape;
}

function newRoomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const TOKEN_FIELD = z
  .string()
  .optional()
  .describe(
    "Opaque anonymous room identity issued by Crawler. Reuse the same room_token for every room_* call of the same person. If omitted, a new anonymous identity is created and returned — store it, there is no account and no other way back.",
  );

const SESSION_FIELD = z
  .string()
  .optional()
  .describe(
    "Optional Crawler draft session id (sess_…) of a paid Presence. Pass it once to unlock the paid room features that this subscription includes.",
  );

function adapt(tool: RoomTool) {
  return defineTool({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: { ...toShape(tool.inputSchema), room_token: TOKEN_FIELD, session_id: SESSION_FIELD },
    annotations: tool.annotations as never,
    outputSchema: toOutputShape(tool.outputSchema),

    handler: async (input: Record<string, unknown> | undefined) => {
      const raw = (input ?? {}) as Record<string, unknown>;
      const { room_token: provided, session_id: sessionId, ...rest } = raw;
      const token = typeof provided === "string" && provided.trim() ? provided.trim() : newRoomToken();
      const issued = token !== provided;

      try {
        // Server-side plan gate — the caller never supplies its own plan.
        const { checkToolAccess, linkSessionPlanToRoomToken } = await import("@/lib/entitlements/guard.server");
        const { detectLanguage } = await import("@/lib/entitlements/upgrade.server");
        const session = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : null;
        // A paid draft session unlocks the room features of its subscription.
        if (session) await linkSessionPlanToRoomToken(token, session);
        const denied = await checkToolAccess({
          tool: tool.name,
          roomToken: token,
          sessionToken: session,
          language: detectLanguage(rest),
          feature: tool.title,
        });
        if (denied) {
          return {
            content: [
              { type: "text" as const, text: `${denied.message}\n\n${denied.cta_label}: ${denied.upgrade_url}` },
            ],
            structuredContent: { ...denied, room_token: token },
          };
        }

        const result = await tool.handler(rest, { "room/token": token, "crawler/session_id": session });
        let text = tool.summary(result);
        if (issued) {
          text += `\n\nAnonymes room_token (bitte speichern und bei jedem weiteren room-Aufruf mitgeben): ${token}`;
        }
        // Internal fields (prefixed with "_") never leave the server as data;
        // "_ui_html" becomes an embedded UI resource block instead.
        const uiHtml = typeof result["_ui_html"] === "string" ? (result["_ui_html"] as string) : null;
        const uiUri = typeof result["_ui_uri"] === "string" ? (result["_ui_uri"] as string) : null;
        const uiMime = typeof result["_ui_mime"] === "string" ? (result["_ui_mime"] as string) : "text/html";
        const publicResult = Object.fromEntries(
          Object.entries(result).filter(([key]) => !key.startsWith("_")),
        );
        const content: Array<Record<string, unknown>> = [{ type: "text" as const, text }];
        if (uiHtml && uiUri) {
          content.push({
            type: "resource" as const,
            resource: { uri: uiUri, mimeType: uiMime, text: uiHtml },
          });
        }
        return {
          content: content as never,
          structuredContent: { ...publicResult, room_token: token },
        };
      } catch (error) {
        console.error("[room-tool]", tool.name, error);
        const roomError = toRoomError(error);

        // Plan and limit errors are answered as helpful upgrade content,
        // never as a technical exception.
        if (roomError.code === "PLAN_REQUIRED" || roomError.code === "LIMIT_REACHED") {
          const { buildUpgradePayload, detectLanguage } = await import("@/lib/entitlements/upgrade.server");
          const { resolvePlanContext } = await import("@/lib/entitlements/guard.server");
          const ctx = await resolvePlanContext(token);
          const details = roomError.details as { max?: number; current?: number; limit?: string };
          const payload = await buildUpgradePayload({
            tool: tool.name,
            feature: tool.title,
            currentPlan: ctx.plan,
            language: detectLanguage(rest),
            contextHash: ctx.subjectHash,
            ...(roomError.code === "LIMIT_REACHED" && typeof details.max === "number"
              ? {
                  usage: {
                    used: typeof details.current === "number" ? details.current : details.max,
                    max: details.max,
                    unit: String(details.limit ?? "items"),
                  },
                }
              : {}),
          });
          return {
            content: [
              { type: "text" as const, text: `${payload.message}\n\n${payload.cta_label}: ${payload.upgrade_url}` },
            ],
            structuredContent: { ...payload, room_token: token },
          };
        }

        return {
          isError: true,
          content: [{ type: "text" as const, text: roomError.message }],
          structuredContent: { error: roomError.code, message: roomError.message, room_token: token },
        };
      }
    },
  });
}


const ALL_ROOM_TOOLS = [
  ...(TOOLS as unknown as RoomTool[]),
  ...(PERSONAL_TOOLS as unknown as RoomTool[]),
  ...(PLUS_TOOLS as unknown as RoomTool[]),
  ...(PROFILE_TOOLS as unknown as RoomTool[]),
  ...(MATCH_TOOLS as unknown as RoomTool[]),
  ...(SOCIAL_TOOLS as unknown as RoomTool[]),
  ...(SUGAR_TOOLS as unknown as RoomTool[]),
  ...(LOVE_TOOLS as unknown as RoomTool[]),
];

const seen = new Set<string>();
export const roomTools = ALL_ROOM_TOOLS.filter((tool) => {
  if (seen.has(tool.name)) return false;
  seen.add(tool.name);
  return true;
}).map(adapt);
