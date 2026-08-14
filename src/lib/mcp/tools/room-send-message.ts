import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { resolveIdentity, resolveTopicSlug, sendMessage, touchPresence } from "../../room/core.server";
import { guarded, ok } from "../../room/tool-helpers.server";

export default defineTool({
  name: "room_send_message",
  title: "Send a room message",
  description:
    "Sends a message into the user's current room for a topic. Requires the room_token returned by room_enter_topic. Messages are at most 500 characters, may contain at most two links and disappear after 24 hours.",
  inputSchema: {
    room_token: z.string().min(1).describe("Anonymous token from room_enter_topic."),
    topic: z.string().min(1).describe("Topic name or slug of the room."),
    message: z.string().min(1).describe("The message text to post."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: ({ room_token, topic, message }) =>
    guarded(async () => {
      const identity = await resolveIdentity(room_token, false);
      const slug = await resolveTopicSlug(topic);
      const sent = await sendMessage(identity.hash, slug, message);
      await touchPresence(identity.hash);
      return ok(
        `Sent as "${sent.alias}". ${sent.members_online} people online. The message disappears after 24 hours.`,
        sent as unknown as Record<string, unknown>,
      );
    }),
});
