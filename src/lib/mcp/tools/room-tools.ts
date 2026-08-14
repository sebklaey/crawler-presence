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

function adapt(tool: RoomTool) {
  return defineTool({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: { ...toShape(tool.inputSchema), room_token: TOKEN_FIELD },
    annotations: tool.annotations as never,
    handler: async (input: Record<string, unknown> | undefined) => {
      const raw = (input ?? {}) as Record<string, unknown>;
      const { room_token: provided, ...rest } = raw;
      const token = typeof provided === "string" && provided.trim() ? provided.trim() : newRoomToken();
      const issued = token !== provided;

      try {
        const result = await tool.handler(rest, { "room/token": token });
        let text = tool.summary(result);
        if (issued) {
          text += `\n\nAnonymes room_token (bitte speichern und bei jedem weiteren room-Aufruf mitgeben): ${token}`;
        }
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { ...result, room_token: token },
        };
      } catch (error) {
        const roomError = toRoomError(error);
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
];

export const roomTools = ALL_ROOM_TOOLS.map(adapt);
