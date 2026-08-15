/**
 * Canonical, per-data-class retention catalog.
 *
 * This is the ONLY place retention is described in user-facing copy. Every
 * entry mirrors behaviour that actually exists in the database cleanup
 * routines (`cleanup_expired`, `enforce_text_retention`,
 * `enforce_image_retention`, `purge_dead_images`, `love_cleanup_expired`) or
 * in server code — there is no blanket "everything is deleted after 24 hours"
 * rule, and copy must never claim one.
 */

export type RetentionEntry = {
  /** Data class as a person would name it. */
  data: string;
  /** Retention in plain language — must match real behaviour. */
  retention: string;
  /** Where the rule is enforced. */
  basis: string;
};

export const RETENTION_CATALOG: readonly RetentionEntry[] = [
  {
    data: "Room messages (topic, personal and Pair Rooms)",
    retention:
      "Deleted after at most 24 hours. In addition only the newest 7 texts per room are kept; the Universal Room keeps the 24-hour limit without a volume cap.",
    basis: "Automatic database cleanup",
  },
  {
    data: "Room images",
    retention:
      "Deleted after at most 24 hours, and only the newest 3 approved images per room are kept. Rejected, failed or never-reviewed uploads are purged within 30 minutes.",
    basis: "Automatic database cleanup and storage purge",
  },
  {
    data: "Anonymous draft sessions (interview drafts, unpublished Knowledge Cores)",
    retention: "Expire 30 days after they were last used, then deleted.",
    basis: "Session expiry",
  },
  {
    data: "Published Presence content (/p/… files, Knowledge Core, public profile)",
    retention:
      "Durable — kept for as long as the Presence exists. Deleted or anonymised after it is taken offline and no longer needed.",
    basis: "Owner-controlled, not time-limited",
  },
  {
    data: "Public Crawler profile and room metadata (optional handle, room name, description)",
    retention: "Kept while the room exists; removed when the owner deletes it.",
    basis: "Owner-controlled",
  },
  {
    data: "Room memberships",
    retention:
      "Alias and identity reference are anonymised 7 days after leaving a room, unless the identity still owns a room.",
    basis: "Automatic database cleanup",
  },
  {
    data: "Empty topic rooms",
    retention: "Deleted 24 hours after creation when nobody joined and nothing was posted.",
    basis: "Automatic database cleanup",
  },
  {
    data: "Room notifications",
    retention: "Deleted after 30 days.",
    basis: "Automatic database cleanup",
  },
  {
    data: "Love interview drafts and match requests",
    retention: "Drafts are deleted at their expiry; open match requests expire and are closed automatically.",
    basis: "Automatic database cleanup",
  },
  {
    data: "Rate-limit counters",
    retention: "Deleted after 2 hours.",
    basis: "Automatic database cleanup",
  },
  {
    data: "Sponsored-campaign impression log",
    retention: "Deleted after 24 hours; only aggregate counters remain.",
    basis: "Automatic database cleanup",
  },
  {
    data: "Analytics events and aggregates (measured inside Crawler only)",
    retention:
      "Minimized events — event type, entity reference, timestamp and an unlinkable hashed session id — are kept for at most 13 months, then deleted. Aggregates may be kept longer in non-identifying form.",
    basis: "Retention policy, executed periodically and on request",
  },
  {
    data: "Billing records (subscription mirror, publish intents)",
    retention:
      "Kept while the subscription runs and afterwards for statutory accounting periods. Paddle, our Merchant of Record, holds the payment data under its own retention rules.",
    basis: "Legal obligation",
  },
  {
    data: "Security and webhook audit data (verified provider event ids, quarantined duplicates, error logs)",
    retention:
      "Kept as an integrity and abuse-prevention record for up to 24 months. Contains ids, event types and timestamps — no message content and no raw capability values.",
    basis: "Legitimate interest — fraud and replay protection",
  },
  {
    data: "Capabilities (draft session, room identity token, recovery/management code)",
    retention:
      "Stored only as one-way hashes for as long as the thing they control exists. Raw values are shown once at issuing and never stored, logged or put in a URL.",
    basis: "Security by design",
  },
] as const;
