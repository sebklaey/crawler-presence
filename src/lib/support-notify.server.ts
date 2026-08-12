/**
 * Support ticket notifications.
 *
 * Crawler stays accountless, so support is inbox-driven: every new ticket and
 * every change to an existing ticket is announced to the Crawler support
 * address. Nothing here exposes ticket data publicly.
 */
import { CRAWLER_SUPPORT_EMAIL, sendMail } from "./email.server";

export type TicketRow = {
  id: string;
  email: string;
  subject: string;
  message: string;
  presence_slug: string | null;
  status: string;
  thread_id: string | null;
  is_follow_up: boolean;
  notified_status: string | null;
  created_at: string;
  updated_at: string;
};

/** Window in which a new message from the same address joins an open thread. */
const THREAD_WINDOW_DAYS = 30;

/**
 * Finds an open ticket from the same sender so follow-up messages are
 * announced as an update instead of looking like an unrelated new request.
 */
export async function findOpenThread(
  supabase: any,
  email: string,
): Promise<{ thread_id: string; subject: string } | null> {
  const since = new Date(Date.now() - THREAD_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, thread_id, subject, status, created_at")
    .eq("email", email)
    .neq("status", "closed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const row = data[0] as { id: string; thread_id: string | null; subject: string };
  return { thread_id: row.thread_id || row.id, subject: row.subject };
}

/** Notification for a newly received ticket (or a follow-up on an open one). */
export async function notifyNewTicket(ticket: {
  id: string;
  email: string;
  subject: string;
  message: string;
  presence_slug?: string | null;
  isFollowUp: boolean;
  threadSubject?: string;
}): Promise<{ delivered: boolean; reason?: string }> {
  const heading = ticket.isFollowUp
    ? `Crawler support · Update · ${ticket.subject}`
    : `Crawler support · ${ticket.subject}`;

  const lines = [
    `Ticket: ${ticket.id}`,
    ticket.isFollowUp ? `Follow-up on: ${ticket.threadSubject || ticket.subject}` : "New request",
    `From: ${ticket.email}`,
    ticket.presence_slug ? `Presence: ${ticket.presence_slug}` : "Presence: (none given)",
    "",
    ticket.message,
  ];

  return sendMail({
    to: CRAWLER_SUPPORT_EMAIL,
    replyTo: ticket.email,
    template: ticket.isFollowUp ? "support-update" : "support-request",
    subject: heading,
    text: lines.join("\n"),
    idempotencyKey: `ticket-new-${ticket.id}`,
  });
}

/**
 * Announces status changes on existing tickets. Each ticket carries the status
 * that was last announced, so a run only reports genuine changes and never
 * repeats itself.
 */
export async function notifyTicketUpdates(): Promise<{ notified: number; skipped: number }> {
  const { db } = await import("./mcp/db.server");
  const supabase = db();
  if (!supabase) return { notified: 0, skipped: 0 };

  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, email, subject, message, presence_slug, status, thread_id, is_follow_up, notified_status, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error || !data) return { notified: 0, skipped: 0 };

  let notified = 0;
  let skipped = 0;

  for (const row of data as TicketRow[]) {
    const previous = row.notified_status;
    if (previous === row.status) {
      skipped += 1;
      continue;
    }

    const result = await sendMail({
      to: CRAWLER_SUPPORT_EMAIL,
      replyTo: row.email,
      template: "support-update",
      subject: `Crawler support · ${row.status} · ${row.subject}`,
      text: [
        `Ticket: ${row.id}`,
        `Status: ${previous ?? "new"} -> ${row.status}`,
        `From: ${row.email}`,
        row.presence_slug ? `Presence: ${row.presence_slug}` : "Presence: (none given)",
        `Updated: ${row.updated_at}`,
        "",
        row.message,
      ].join("\n"),
      idempotencyKey: `ticket-status-${row.id}-${row.status}`,
    });

    // Record the announced status either way: a permanently undeliverable
    // notification must not make every later run retry the same ticket.
    await supabase
      .from("support_tickets")
      .update({ notified_status: row.status, notified_at: new Date().toISOString() })
      .eq("id", row.id);

    if (result.delivered) notified += 1;
    else skipped += 1;
  }

  return { notified, skipped };
}
