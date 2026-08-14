import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { generateAlias, getCustomAlias, resolveIdentity } from "../../room/core.server";
import { guarded, ok } from "../../room/tool-helpers.server";

export default defineTool({
  name: "room_get_alias",
  title: "Get room display name",
  description: "Returns the anonymous display name currently used by this room_token in Crawler Rooms.",
  inputSchema: {
    room_token: z.string().min(1).describe("Anonymous token from room_enter_topic."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: ({ room_token }) =>
    guarded(async () => {
      const identity = await resolveIdentity(room_token, false);
      const custom = await getCustomAlias(identity.hash);
      return ok(
        custom
          ? `Your display name is "${custom}".`
          : `You have no custom display name yet; rooms assign one automatically (e.g. "${generateAlias(identity.hash)}"). Use room_set_alias to choose one.`,
        { alias: custom, is_custom: Boolean(custom) },
      );
    }),
});
