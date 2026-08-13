import { ToolError } from "@lovable.dev/mcp-js";

/**
 * Turns a failed entity lookup into an explicit tool error. Without this the
 * assistant would be told the entity does not exist, and would repeat that to
 * the user about a Presence that is live.
 */
export function rethrowLookupFailure(error: unknown): never {
  if (error instanceof Error && error.name === "EntityLookupError")
    throw new ToolError(error.message);
  throw error;
}
