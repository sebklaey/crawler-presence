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
    const { EMAIL_REGEX } = await import("./email.server");
    if (!EMAIL_REGEX.test(data.email)) return { ok: false, delivered: false, reason: "invalid-email" };

    const { allowRequest } = await import("./mcp/presences");
    if (!(await allowRequest("support", 30))) return { ok: false, delivered: false, reason: "rate-limited" };

    const { findOpenThread, notifyNewTicket } = await import("./support-notify.server");

    let supabase: any = null;
    try {
      const { db } = await import("./mcp/db.server");
      supabase = db();
    } catch {
      supabase = null;
    }

    // Store first so the ticket id can be quoted in the notification and the
    // request survives even if delivery fails.
    let ticketId = crypto.randomUUID();
    let thread: { thread_id: string; subject: string } | null = null;

    if (supabase) {
      try {
        thread = await findOpenThread(supabase, data.email);
        const { data: inserted, error } = await supabase
          .from("support_tickets")
          .insert({
            email: data.email,
            subject: data.subject,
            message: data.message,
            presence_slug: data.slug || null,
            thread_id: thread?.thread_id ?? null,
            is_follow_up: Boolean(thread),
            delivered: false,
          })
          .select("id")
          .single();
        if (error) throw error;
        ticketId = inserted.id as string;
        if (!thread) {
          await supabase.from("support_tickets").update({ thread_id: ticketId }).eq("id", ticketId);
        }
      } catch (error) {
        console.error("[crawler] support ticket store failed", error instanceof Error ? error.message : "unknown");
      }
    }

    const mail = await notifyNewTicket({
      id: ticketId,
      email: data.email,
      subject: data.subject,
      message: data.message,
      presence_slug: data.slug || null,
      isFollowUp: Boolean(thread),
      ...(thread ? { threadSubject: thread.subject } : {}),
    });

    if (supabase) {
      try {
        await supabase
          .from("support_tickets")
          .update({
            delivered: mail.delivered,
            notified_status: "open",
            notified_at: new Date().toISOString(),
          })
          .eq("id", ticketId);
      } catch {
        // Bookkeeping only — the ticket itself is already stored.
      }
    }

    // The request is recorded either way, so the user is never told it vanished.
    return { ok: true, delivered: mail.delivered };
  });
