import { RoomError, roomError } from "./core.server";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function ok(text: string, structured: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text }], structuredContent: structured };
}

export function fail(error: unknown): ToolResult {
  const known = error instanceof RoomError ? error : roomError("INTERNAL_ERROR");
  return {
    content: [{ type: "text", text: known.message }],
    structuredContent: { error: { code: known.code, message: known.message } },
    isError: true,
  };
}

export async function guarded(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (error) {
    return fail(error);
  }
}
