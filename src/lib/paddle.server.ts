/**
 * Paddle Billing access (server only).
 *
 * Crawler has no user accounts, so nothing here identifies a person. A checkout
 * carries only the anonymous publish-intent reference (`pi_…`) in Paddle's
 * `custom_data`, and the webhook matches events back to that reference.
 *
 * Required secrets (Project Settings → Secrets):
 *   PADDLE_API_KEY          `pdl_sdbx_apikey_…` (sandbox) or `pdl_live_apikey_…`
 *   PADDLE_WEBHOOK_SECRET   notification-destination secret, `pdl_ntfset_…`
 *   PADDLE_PRICE_PLUS       `pri_…` monthly price for the Plus plan
 *   PADDLE_PRICE_PRO        `pri_…` monthly price for the Pro plan
 *   PADDLE_PRICE_BUSINESS   `pri_…` monthly price for the Business plan
 *
 * Without them the whole publish flow still runs, in clearly labelled DEMO mode.
 */
import type { PlanId } from "./billing";

export type PaddleEnv = "sandbox" | "live";

const API_BASE: Record<PaddleEnv, string> = {
  sandbox: "https://sandbox-api.paddle.com",
  live: "https://api.paddle.com",
};

const env = (name: string): string | undefined => process.env[name]?.trim() || undefined;

export function paddleApiKey(): string | undefined {
  return env("PADDLE_API_KEY");
}

/** Sandbox vs live is derived from the API key itself — never guessed. */
export function paddleEnvironment(): PaddleEnv {
  return paddleApiKey()?.includes("_live_") ? "live" : "sandbox";
}

const PRICE_ENV: Record<PlanId, string> = {
  plus: "PADDLE_PRICE_PLUS",
  pro: "PADDLE_PRICE_PRO",
  business: "PADDLE_PRICE_BUSINESS",
};

export function paddlePriceId(plan: PlanId): string | undefined {
  return env(PRICE_ENV[plan]);
}

/** True when this deployment can really charge for the given environment. */
export function paymentsConfigured(target: PaddleEnv): boolean {
  const key = paddleApiKey();
  if (!key || paddleEnvironment() !== target) return false;
  return (Object.keys(PRICE_ENV) as PlanId[]).every((plan) => Boolean(paddlePriceId(plan)));
}

export function getPaddleErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Paddle request failed";
}

type PaddleResponse<T> = { data?: T; error?: { detail?: string; code?: string } };

async function paddleFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const key = paddleApiKey();
  if (!key) throw new Error("PADDLE_API_KEY is not configured");

  const response = await fetch(`${API_BASE[paddleEnvironment()]}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as PaddleResponse<T>;
  if (!response.ok || payload.error) {
    const detail = payload.error?.detail ?? `HTTP ${response.status}`;
    const code = payload.error?.code;
    throw new Error(code ? `${detail} (${code})` : detail);
  }
  if (!payload.data) throw new Error("Paddle returned no data");
  return payload.data;
}

/* ------------------------------------------------------------------ */
/* Checkout                                                            */
/* ------------------------------------------------------------------ */

type TransactionResponse = {
  id: string;
  checkout?: { url?: string | null } | null;
};

/**
 * Creates a subscription transaction and returns its Paddle-hosted checkout
 * URL. The Paddle account needs a default payment link (Checkout settings →
 * Paddle-hosted checkout); Paddle builds the URL from it.
 */
export async function createHostedCheckout(input: {
  plan: PlanId;
  intentRef: string;
}): Promise<{ transactionId: string; url: string }> {
  const priceId = paddlePriceId(input.plan);
  if (!priceId) throw new Error(`No Paddle price configured for the ${input.plan} plan`);

  const transaction = await paddleFetch<TransactionResponse>("/transactions", {
    method: "POST",
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
      // Only the anonymous intent reference travels with the payment.
      custom_data: { intent_ref: input.intentRef, plan: input.plan },
    }),
  });

  const url = transaction.checkout?.url;
  if (!url) {
    throw new Error(
      "Paddle did not return a checkout URL. Set a default payment link for Paddle-hosted checkout in your Paddle checkout settings.",
    );
  }
  return { transactionId: transaction.id, url };
}

/* ------------------------------------------------------------------ */
/* Customer portal                                                     */
/* ------------------------------------------------------------------ */

type PortalResponse = { urls?: { general?: { overview?: string } } };

/** Paddle's own billing portal — the only place a subscription is managed. */
export async function createPortalUrl(customerId: string, subscriptionId?: string | null): Promise<string> {
  const portal = await paddleFetch<PortalResponse>(`/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
    method: "POST",
    body: JSON.stringify(subscriptionId ? { subscription_ids: [subscriptionId] } : {}),
  });
  const url = portal.urls?.general?.overview;
  if (!url) throw new Error("Paddle returned no portal URL");
  return url;
}

/* ------------------------------------------------------------------ */
/* Webhook verification                                                */
/* ------------------------------------------------------------------ */

export type PaddleEvent = { type: string; data: Record<string, unknown> };

function webhookSecret(target: PaddleEnv): string {
  const scoped = target === "sandbox" ? env("PADDLE_SANDBOX_WEBHOOK_SECRET") : env("PADDLE_LIVE_WEBHOOK_SECRET");
  const secret = scoped ?? env("PADDLE_WEBHOOK_SECRET");
  if (!secret) throw new Error("PADDLE_WEBHOOK_SECRET is not configured");
  return secret;
}

/** Verifies `Paddle-Signature: ts=<unix>;h1=<hmac>` over `<ts>:<raw body>`. */
export async function verifyWebhook(req: Request, target: PaddleEnv): Promise<PaddleEvent> {
  const header = req.headers.get("paddle-signature");
  const body = await req.text();
  if (!header || !body) throw new Error("Missing signature or body");

  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(";")) {
    const [key, value] = part.split("=", 2);
    if (key?.trim() === "ts") timestamp = value;
    if (key?.trim() === "h1" && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) throw new Error("Invalid signature format");

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) throw new Error("Webhook timestamp too old");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret(target)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}:${body}`));
  const expected = [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!signatures.includes(expected)) throw new Error("Invalid webhook signature");

  const parsed = JSON.parse(body) as { event_type?: string; data?: Record<string, unknown> };
  return { type: parsed.event_type ?? "", data: parsed.data ?? {} };
}
