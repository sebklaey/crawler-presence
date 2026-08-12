/**
 * Outbound email for Crawler.
 *
 * Crawler stays accountless: email addresses are only ever supplied by the
 * person who holds a recovery code (report recipient) or typed into the
 * support form. Nothing here creates an account.
 *
 * Delivery goes through the workspace email domain. When email is not
 * configured yet, the message is not silently dropped — the caller learns it
 * was not delivered and support requests remain stored in the database.
 */

type RuntimeGlobals = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

function env(name: string): string | undefined {
  return (globalThis as RuntimeGlobals).process?.env?.[name]?.trim() || undefined;
}

/** Crawler's own inbox — support requests and operational reports land here. */
export const CRAWLER_SUPPORT_EMAIL = "sebklay@me.com";

export type SendResult = { delivered: boolean; reason?: string };

export type Mail = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

function sender(): { from: string; key: string } | null {
  const key = env("RESEND_API_KEY") || env("LOVABLE_EMAIL_API_KEY");
  const domain = env("EMAIL_SENDING_DOMAIN") || env("LOVABLE_EMAIL_DOMAIN");
  if (!key || !domain) return null;
  return { key, from: `Crawler <notify@${domain}>` };
}

export function emailConfigured(): boolean {
  return sender() !== null;
}

/** Sends one plain-text email. Never throws — callers keep working without it. */
export async function sendMail(mail: Mail): Promise<SendResult> {
  const config = sender();
  if (!config) return { delivered: false, reason: "email-not-configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error(`[crawler] email send failed [${response.status}]: ${detail.slice(0, 400)}`);
      return { delivered: false, reason: `provider-error-${response.status}` };
    }
    return { delivered: true };
  } catch (error) {
    console.error("[crawler] email send failed", error instanceof Error ? error.message : "unknown error");
    return { delivered: false, reason: "network-error" };
  }
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
