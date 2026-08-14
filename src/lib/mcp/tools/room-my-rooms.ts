import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { myRooms, resolveIdentity, touchPresence } from "../../room/core.server";
import { guarded, ok } from "../../room/tool-helpers.server";

export default defineTool({
  name: "room_my_rooms",
  title: "My rooms",
  description:
    "Lists all rooms the anonymous room_token is currently a member of, including display name, people online and unread message count.",
  inputSchema: {
    room_token: z.string().min(1).describe("Anonymous token from room_enter_topic."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: ({ room_token }) =>
    guarded(async () => {
      const identity = await resolveIdentity(room_token, false);
      const rooms = await myRooms(identity.hash);
      await touchPresence(identity.hash);
      const text = rooms.length
        ? rooms
            .map(
              (r) =>
                `${r.topic_display_name} room #${r.room_number} as "${r.alias}" — ${r.members_online} online, ${r.unread_messages} unread`,
            )
            .join("\n")
        : "You are currently not in any room. Use room_list_topics and room_enter_topic to join one.";
      return ok(text, { rooms });
    }),
});
