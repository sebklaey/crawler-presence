import { defineTool } from "@lovable.dev/mcp-js";
import { listTopics } from "../../room/core.server";
import { guarded, ok } from "../../room/tool-helpers.server";

export default defineTool({
  name: "room_list_topics",
  title: "List chat topics",
  description:
    "Use this when the user wants to chat with other people in Crawler Rooms. Returns the available topics (AI, Art, Science, Tech, Music, Gaming, Life) with how many small rooms are active and how many people are online right now.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: () =>
    guarded(async () => {
      const topics = await listTopics();
      const text = topics
        .map((t) => `${t.display_name} (${t.slug}): ${t.members_online} online in ${t.active_rooms} room(s)`)
        .join("\n");
      return ok(
        `Crawler Rooms are small anonymous chat rooms with at most 5 people. Messages disappear after 24 hours.\n${text}\nUse room_enter_topic with a topic to join.`,
        { topics },
      );
    }),
});
