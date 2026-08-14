import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { resolveIdentity, roomError, sanitizeAlias, setCustomAlias } from "../../room/core.server";
import { guarded, ok } from "../../room/tool-helpers.server";

export default defineTool({
  name: "room_set_alias",
  title: "Set room display name",
  description:
    "Sets the anonymous display name used in every room of this room_token. Names are unique across Crawler Rooms and contain no personal data.",
  inputSchema: {
    room_token: z.string().min(1).describe("Anonymous token from room_enter_topic."),
    alias: z.string().min(1).max(32).describe("The display name to use, e.g. 'Blue Fox'."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: ({ room_token, alias }) =>
    guarded(async () => {
      const identity = await resolveIdentity(room_token, false);
      const cleaned = sanitizeAlias(alias);
      if (!cleaned) throw roomError("INVALID_INPUT");
      const result = await setCustomAlias(identity.hash, cleaned);
      return ok(`Your display name is now "${result.alias}".`, result as unknown as Record<string, unknown>);
    }),
});
