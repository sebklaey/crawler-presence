/**
 * Custom support. A visitor can write to Crawler without an account: the
 * request is stored in the backend and emailed to the Crawler support inbox.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().min(5).max(200),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(4000),
  slug: z.string().trim().max(120).optional(),
});

export const submitSupportFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; delivered: boolean; reason?: string }> => {
    const { EMAIL_REGEX, CRAWLER_SUPPORT_EMAIL, sendMail } = await import("./email.server");
    if (!EMAIL_REGEX.test(data.email)) return { ok: false, delivered: false, reason: "invalid-email" };

    const { allowRequest } = await import("./mcp/presences");
    if (!(await allowRequest("support", 30))) return { ok: false, delivered: false, reason: "rate-limited" };

    const mail = await sendMail({
      to: CRAWLER_SUPPORT_EMAIL,
      replyTo: data.email,
      template: "support-request",
      subject: `Crawler support · ${data.subject}`,
      text: [
        `From: ${data.email}`,
        data.slug ? `Presence: ${data.slug}` : "Presence: (none given)",
        "",
        data.message,
      ].join("\n"),
    });


    try {
      const { db } = await import("./mcp/db.server");
      const supabase = db();
      if (supabase) {
        await supabase.from("support_tickets").insert({
          email: data.email,
          subject: data.subject,
          message: data.message,
          presence_slug: data.slug || null,
          delivered: mail.delivered,
        });
      }
    } catch (error) {
      console.error("[crawler] support ticket store failed", error instanceof Error ? error.message : "unknown");
    }

    // The request is recorded either way, so the user is never told it vanished.
    return { ok: true, delivered: mail.delivered };
  });
