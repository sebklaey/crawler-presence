import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { reportMessage, resolveIdentity } from "../../room/core.server";
import { guarded, ok } from "../../room/tool-helpers.server";

export default defineTool({
  name: "room_report_message",
  title: "Report a message",
  description:
    "Reports a message in the user's room for abuse (spam, harassment, hate, sexual content, violence, personal data, other). Reports are stored without message content and reviewed by the Crawler operator.",
  inputSchema: {
    room_token: z.string().min(1).describe("Anonymous token from room_enter_topic."),
    message_id: z.number().int().positive().describe("The message_id shown by room_read_messages."),
    reason: z
      .enum(["spam", "harassment", "hate", "sexual_content", "violence", "personal_data", "other"])
      .describe("Why the message is being reported."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: ({ room_token, message_id, reason }) =>
    guarded(async () => {
      const identity = await resolveIdentity(room_token, false);
      const result = await reportMessage(identity.hash, message_id, reason);
      return ok("Thanks — the message was reported and will be reviewed.", result as unknown as Record<string, unknown>);
    }),
});
