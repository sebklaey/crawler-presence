import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { leaveTopic, resolveIdentity, resolveTopicSlug } from "../../room/core.server";
import { guarded, ok } from "../../room/tool-helpers.server";

export default defineTool({
  name: "room_leave_topic",
  title: "Leave a room",
  description:
    "Leaves the user's current room for a topic. The seat is freed for someone else; the person can enter the topic again at any time with the same room_token.",
  inputSchema: {
    room_token: z.string().min(1).describe("Anonymous token from room_enter_topic."),
    topic: z.string().min(1).describe("Topic name or slug of the room to leave."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: ({ room_token, topic }) =>
    guarded(async () => {
      const identity = await resolveIdentity(room_token, false);
      const slug = await resolveTopicSlug(topic);
      const result = await leaveTopic(identity.hash, slug);
      return ok(`You left the ${slug} room. You can join again any time.`, result);
    }),
});
