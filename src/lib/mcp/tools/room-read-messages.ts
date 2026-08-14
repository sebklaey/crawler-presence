import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { readMessages, resolveIdentity, resolveTopicSlug, touchPresence } from "../../room/core.server";
import { guarded, ok } from "../../room/tool-helpers.server";

export default defineTool({
  name: "room_read_messages",
  title: "Read room messages",
  description:
    "Reads the most recent messages in the user's room for a topic and marks them as read. Requires the room_token from room_enter_topic. Use since_message_id to fetch only new messages.",
  inputSchema: {
    room_token: z.string().min(1).describe("Anonymous token from room_enter_topic."),
    topic: z.string().min(1).describe("Topic name or slug of the room."),
    limit: z.number().int().min(1).max(50).optional().describe("How many messages to return (default 20)."),
    since_message_id: z.number().int().positive().optional().describe("Return only messages newer than this id."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: ({ room_token, topic, limit, since_message_id }) =>
    guarded(async () => {
      const identity = await resolveIdentity(room_token, false);
      const slug = await resolveTopicSlug(topic);
      const result = await readMessages(identity.hash, slug, limit ?? 20, since_message_id);
      await touchPresence(identity.hash);
      const text = result.messages.length
        ? result.messages.map((m) => `${m.alias}${m.is_you ? " (you)" : ""}: ${m.body}`).join("\n")
        : "No messages yet in this room. Be the first to write something.";
      return ok(`${text}\n\n${result.members_online} people online.`, result as unknown as Record<string, unknown>);
    }),
});
