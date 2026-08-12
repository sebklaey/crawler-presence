/**
 * Scheduled Presence report emails (Business).
 *
 * A report contains only measured Crawler data for one Presence: mentions,
 * conversations, public reads and outbound clicks. Crawler has no access to
 * private ChatGPT, Claude, Gemini or other assistant conversations, and the
 * report says so.
 *
 * Recipients are set by whoever holds the recovery code. Crawler's own
 * operations copy always goes to the Crawler support inbox.
 */
import { PresenceStoreError } from "./mcp/presences";
import { CRAWLER_SUPPORT_EMAIL, sendMail } from "./email.server";

export type ReportFrequency = "off" | "weekly" | "monthly";

export type ReportSettings = {
  email: string | null;
  frequency: ReportFrequency;
  lastSentAt: string | null;
};

const UNAVAILABLE =
  "The Crawler database is temporarily unavailable, so this action was not performed. Nothing was changed — please try again in a moment.";

async function client() {
  const { db } = await import("./mcp/db.server");
  const supabase = db();
  if (!supabase) throw new PresenceStoreError(UNAVAILABLE);
  return supabase;
}

const asFrequency = (value: unknown): ReportFrequency =>
  value === "off" || value === "monthly" ? value : "weekly";

export async function getReportSettings(slug: string): Promise<ReportSettings> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("published_presences")
    .select("report_email, report_frequency, report_last_sent_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new PresenceStoreError(UNAVAILABLE);
  return {
    email: (data?.report_email as string | null) ?? null,
    frequency: asFrequency(data?.report_frequency),
    lastSentAt: (data?.report_last_sent_at as string | null) ?? null,
  };
}

export async function setReportSettings(
  slug: string,
  settings: { email: string | null; frequency: ReportFrequency },
): Promise<void> {
  const supabase = await client();
  const { error } = await supabase
    .from("published_presences")
    .update({ report_email: settings.email, report_frequency: settings.frequency })
    .eq("slug", slug);
  if (error) throw new PresenceStoreError(UNAVAILABLE);
}

async function markSent(slug: string): Promise<void> {
  const supabase = await client();
  await supabase
    .from("published_presences")
    .update({ report_last_sent_at: new Date().toISOString() })
    .eq("slug", slug);
}

/** Builds the plain-text report body from measured events only. */
export async function buildReport(slug: string, days: 7 | 30): Promise<{ subject: string; text: string } | null> {
  const { getPublished } = await import("./mcp/presences");
  const presence = await getPublished(slug);
  if (!presence) return null;

  const { publicSummary, detailedSummary, PRIVACY_NOTE } = await import("./mcp/presence-analytics");
  const period = (days === 30 ? 90 : 7) as 7 | 90;
  const [summary, detail] = await Promise.all([
    publicSummary(slug, presence.core?.name || slug, period),
    detailedSummary(slug, period),
  ]);

  const name = presence.core?.name || slug;
  const files = (detail?.file_reads ?? []).slice(0, 5);

  const text = [
    `Crawler report for ${name}`,
    `Window: last ${days} days · Presence: /p/${slug} · Status: ${presence.status}`,
    "",
    "Measured inside Crawler",
    `· Crawler conversations mentioning this Presence: ${summary?.conversations_mentioning ?? 0}`,
    `· Mention events: ${summary?.mention_events ?? 0}`,
    `· Public reads of your files and Presence page: ${summary?.crawler_reads ?? 0}`,
    `· Trackable outbound clicks: ${detail?.outbound_clicks ?? 0}`,
    "",
    files.length ? "Most read files" : "No file reads measured in this window.",
    ...files.map((f) => `· ${f.path} — ${f.count}`),
    "",
    PRIVACY_NOTE,
    "",
    `Manage this Presence: https://crawler.today/manage`,
    `Support: ${CRAWLER_SUPPORT_EMAIL}`,
  ].join("\n");

  return { subject: `Crawler report · ${name} · last ${days} days`, text };
}

/** Sends the report for one Presence right now. */
export async function sendReport(slug: string, days: 7 | 30, to: string) {
  const report = await buildReport(slug, days);
  if (!report) return { delivered: false, reason: "not-found" as const };
  const result = await sendMail({
    to,
    template: "presence-report",
    subject: report.subject,
    text: report.text,
    replyTo: CRAWLER_SUPPORT_EMAIL,
    idempotencyKey: `report-${slug}-${days}-${new Date().toISOString().slice(0, 10)}`,
  });

  if (result.delivered) await markSent(slug);
  return result;
}

const DUE_MS: Record<Exclude<ReportFrequency, "off">, number> = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Sends every report that is due. Called by the scheduled endpoint, so it is
 * safe to run more often than the cadence — nothing is sent twice.
 */
export async function runDueReports(): Promise<{ checked: number; sent: number; failed: number }> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("published_presences")
    .select("slug, plan, report_email, report_frequency, report_last_sent_at")
    .not("report_email", "is", null)
    .neq("report_frequency", "off");
  if (error) throw new PresenceStoreError(UNAVAILABLE);

  const rows = (data ?? []) as {
    slug: string;
    plan: string;
    report_email: string;
    report_frequency: string;
    report_last_sent_at: string | null;
  }[];

  let sent = 0;
  let failed = 0;
  const now = Date.now();

  for (const row of rows) {
    const frequency = asFrequency(row.report_frequency);
    if (frequency === "off") continue;
    const last = row.report_last_sent_at ? Date.parse(row.report_last_sent_at) : 0;
    if (now - last < DUE_MS[frequency]) continue;

    const result = await sendReport(row.slug, frequency === "monthly" ? 30 : 7, row.report_email);
    if (result.delivered) sent += 1;
    else failed += 1;
  }

  return { checked: rows.length, sent, failed };
}
