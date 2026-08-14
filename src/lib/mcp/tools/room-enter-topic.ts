import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  generateAlias,
  getCustomAlias,
  joinTopic,
  resolveIdentity,
  resolveTopicSlug,
  sanitizeAlias,
  touchPresence,
} from "../../room/core.server";
import { guarded, ok } from "../../room/tool-helpers.server";

export default defineTool({
  name: "room_enter_topic",
  title: "Enter a room",
  description:
    "Joins the user into a small anonymous chat room (max 5 people) for a topic. Accepts free text like 'AI', 'KI', 'Kunst' or 'tech'. If no room_token is given, a new anonymous token is created and returned — store it and pass it to every later room_* call, it is the only way back into the same room.",
  inputSchema: {
    topic: z.string().min(1).describe("Topic name or slug, e.g. 'ai', 'Kunst', 'tech'."),
    room_token: z.string().optional().describe("Opaque anonymous token from a previous room_enter_topic call."),
    alias: z.string().optional().describe("Optional display name for this person."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: ({ topic, room_token, alias }) =>
    guarded(async () => {
      const identity = await resolveIdentity(room_token, true);
      const slug = await resolveTopicSlug(topic);
      const custom = sanitizeAlias(alias) ?? (await getCustomAlias(identity.hash));
      const displayAlias = custom ?? generateAlias(`${identity.hash}:${slug}`);
      const room = await joinTopic(identity.hash, slug, displayAlias);
      await touchPresence(identity.hash);
      return ok(
        `${room.joined_now ? "You joined" : "You are already in"} ${room.topic_display_name} room #${room.room_number} as "${room.alias}". ${room.member_count} of ${room.capacity} seats taken. Messages disappear after 24 hours. Keep this room_token to return: ${identity.token}`,
        { ...room, room_token: identity.token, room_token_is_new: identity.created },
      );
    }),
});
