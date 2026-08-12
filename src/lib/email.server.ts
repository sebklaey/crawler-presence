/**
 * Outbound email for Crawler.
 *
 * Crawler stays accountless: email addresses are only ever supplied by the
 * person who holds a recovery code (report recipient) or typed into the
 * support form. Nothing here creates an account.
 *
 * Delivery goes through the managed email infrastructure on the verified
 * sender domain. Failures never throw — support requests stay stored in the
 * database and the caller learns whether the message went out.
 */

/** Crawler's own inbox — support requests and operational reports land here. */
export const CRAWLER_SUPPORT_EMAIL = "sebklay@me.com";

export type SendResult = { delivered: boolean; reason?: string };

export type Mail = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  /** Which registered template renders the message. */
  template?: "presence-report" | "support-request";
  /** Dedupes retries of the same logical send. */
  idempotencyKey?: string;
};

export function emailConfigured(): boolean {
  return Boolean((globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.["LOVABLE_API_KEY"]);
}

/** Sends one email. Never throws — callers keep working without it. */
export async function sendMail(mail: Mail): Promise<SendResult> {
  if (!emailConfigured()) return { delivered: false, reason: "email-not-configured" };

  try {
    const { sendTemplateEmail } = await import("./email-templates/send-email");
    const result = await sendTemplateEmail(mail.template || "presence-report", mail.to, {
      templateData: { heading: mail.subject, body: mail.text },
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
      ...(mail.idempotencyKey ? { idempotencyKey: mail.idempotencyKey } : {}),
    });
    if (!result.sent) return { delivered: false, reason: result.reason };
    return { delivered: true };
  } catch (error) {
    const reason =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "send-failed";
    console.error("[crawler] email send failed", reason);
    return { delivered: false, reason };
  }
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

