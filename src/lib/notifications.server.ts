/**
 * Lifecycle notifications.
 *
 * Rules: one primary action per message, an explicit reason why it was sent,
 * exactly-once delivery through a dedupe key, respect for the owner's per-topic
 * preferences, and a quiet period so nothing turns into engagement spam.
 * A notification is only sent when there is something real to act on.
 */
import { db } from "./mcp/db.server";
import { CRAWLER_SUPPORT_EMAIL, emailConfigured, sendMail } from "./email.server";

export type NotificationTopic = "source_changes" | "billing" | "reports" | "activation";

export type NotificationEventType =
  | "draft_incomplete_24h"
  | "preview_not_published"
  | "checkout_abandoned"
  | "publication_failed"
  | "first_publication"
  | "source_change_detected"
  | "fact_stale"
  | "conflict_detected"
  | "report_available"
  | "endpoint_unavailable"
  | "payment_failed"
  | "payment_recovered"
  | "subscription_canceled"
  | "grace_period_ending";

const TOPIC_OF: Record<NotificationEventType, NotificationTopic> = {
  draft_incomplete_24h: "activation",
  preview_not_published: "activation",
  checkout_abandoned: "activation",
  publication_failed: "activation",
  first_publication: "activation",
  source_change_detected: "source_changes",
  fact_stale: "source_changes",
  conflict_detected: "source_changes",
  report_available: "reports",
  endpoint_unavailable: "source_changes",
  payment_failed: "billing",
  payment_recovered: "billing",
  subscription_canceled: "billing",
  grace_period_ending: "billing",
};

const PREFERENCE_COLUMN: Record<NotificationTopic, string | null> = {
  source_changes: "notify_source_changes",
  billing: "notify_billing",
  reports: "notify_reports",
  activation: null, // transactional: always allowed
};

/** No more than one message of the same type per Presence within this window. */
const QUIET_HOURS: Record<NotificationTopic, number> = {
  source_changes: 24,
  billing: 6,
  reports: 24 * 20,
  activation: 24,
};

function store() {
  const supabase = db();
  if (!supabase) throw new Error("Notification store unavailable");
  return supabase;
}

export type NotifyInput = {
  slug: string | null;
  eventType: NotificationEventType;
  /** Stable per-occurrence key — the same occurrence never sends twice. */
  dedupeKey: string;
  subject: string;
  reason: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  recipient?: string | null;
};

export type NotifyResult = { sent: boolean; skipped?: "duplicate" | "quiet_period" | "opted_out" | "no_recipient" | "not_configured" };

async function recipientFor(slug: string | null, explicit?: string | null): Promise<string | null> {
  if (explicit) return explicit;
  if (!slug) return null;
  const { data } = await store().from("published_presences").select("report_email").eq("slug", slug).maybeSingle();
  return (data?.["report_email"] as string | null) ?? null;
}

async function allowedByPreference(slug: string | null, topic: NotificationTopic): Promise<boolean> {
  const column = PREFERENCE_COLUMN[topic];
  if (!column || !slug) return true;
  const { data } = await store().from("published_presences").select(column).eq("slug", slug).maybeSingle();
  const row = data as Record<string, unknown> | null;
  return row ? row[column] !== false : true;
}

async function withinQuietPeriod(slug: string | null, eventType: NotificationEventType): Promise<boolean> {
  const hours = QUIET_HOURS[TOPIC_OF[eventType]];
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  let query = store()
    .from("notification_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", eventType)
    .eq("status", "sent")
    .gte("created_at", since);
  query = slug ? query.eq("presence_slug", slug) : query.is("presence_slug", null);
  const { count } = await query;
  return (count ?? 0) > 0;
}

/**
 * Sends one notification at most once. The dedupe key is claimed in the
 * database before the mail leaves, so a retried scheduled job cannot deliver
 * the same message twice.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const topic = TOPIC_OF[input.eventType];

  if (!(await allowedByPreference(input.slug, topic))) return { sent: false, skipped: "opted_out" };
  if (await withinQuietPeriod(input.slug, input.eventType)) return { sent: false, skipped: "quiet_period" };

  const recipient = await recipientFor(input.slug, input.recipient);
  if (!recipient) return { sent: false, skipped: "no_recipient" };

  // Claim the dedupe key first — a unique index makes this exactly-once.
  const { error: claimError } = await store().from("notification_events").insert({
    presence_slug: input.slug,
    event_type: input.eventType,
    channel: "email",
    recipient,
    dedupe_key: input.dedupeKey,
    reason: input.reason,
    status: "pending",
  });
  if (claimError) {
    if (claimError.code === "23505") return { sent: false, skipped: "duplicate" };
    throw new Error("Could not record the notification.");
  }

  if (!emailConfigured()) {
    await store()
      .from("notification_events")
      .update({ status: "not_configured", error: "No email provider configured" })
      .eq("dedupe_key", input.dedupeKey);
    return { sent: false, skipped: "not_configured" };
  }

  const text = [
    input.body,
    "",
    `${input.actionLabel}: ${input.actionUrl}`,
    "",
    `Why you received this: ${input.reason}`,
    "Crawler measures only what it can observe itself — public file reads, Crawler tool interactions and outbound clicks. It has no access to private ChatGPT, Claude, Gemini or other assistant conversations.",
    "To change or stop these emails, open your Presence at https://crawler.today/manage with your recovery code.",
  ].join("\n");

  const result = await sendMail({ to: recipient, subject: input.subject, text } as never);
  await store()
    .from("notification_events")
    .update({
      status: result?.delivered === false ? "failed" : "sent",
      error: result?.delivered === false ? (result.reason ?? "Delivery failed").slice(0, 500) : null,
    })
    .eq("dedupe_key", input.dedupeKey);

  return { sent: result?.delivered !== false };
}

export const OPERATIONS_INBOX = CRAWLER_SUPPORT_EMAIL;
