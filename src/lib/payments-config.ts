/**
 * Payments configuration — the ONE place that decides which payment
 * environment Crawler runs in. Nothing else may derive this.
 *
 * Rules (deliberately simple, so preview and production can never disagree):
 *   - A production build (`import.meta.env.PROD`) bills LIVE. If live
 *     credentials are missing it falls back to sandbox, but is then reported
 *     as unconfigured-for-live so the UI never pretends a real charge.
 *   - A preview / dev build ALWAYS bills SANDBOX. A preview click can never
 *     take real money, no matter which secrets exist.
 *   - `PADDLE_ENV` is intentionally ignored: it was the source of the
 *     sandbox/live confusion.
 *
 * "Configured" means both an API key (to create the checkout) and a webhook
 * secret (to confirm the payment afterwards) exist for that environment.
 */
export type PaymentsEnv = "sandbox" | "live";

type RuntimeGlobals = typeof globalThis & { process?: { env?: Record<string, string | undefined> } };

function envVar(name: string): string | undefined {
  return (globalThis as RuntimeGlobals).process?.env?.[name]?.trim() || undefined;
}

/** Publishable Paddle.js client tokens — safe in the browser by design. */
const CLIENT_TOKEN: Record<PaymentsEnv, string> = {
  sandbox: "test_4deeb70521eee978abaabfba414",
  live: "live_a0d053851e5ba950380c6a6c017",
};

export function paymentsApiKey(target: PaymentsEnv): string | undefined {
  return target === "live" ? envVar("PADDLE_LIVE_API_KEY") : envVar("PADDLE_SANDBOX_API_KEY");
}

export function paymentsWebhookSecret(target: PaymentsEnv): string | undefined {
  return target === "live"
    ? (envVar("PAYMENTS_LIVE_WEBHOOK_SECRET") ?? envVar("PADDLE_LIVE_WEBHOOK_SECRET"))
    : (envVar("PAYMENTS_SANDBOX_WEBHOOK_SECRET") ?? envVar("PADDLE_SANDBOX_WEBHOOK_SECRET"));
}

/** Can this deployment really create AND confirm a charge in `target`? */
export function paymentsConfiguredFor(target: PaymentsEnv): boolean {
  return Boolean(paymentsApiKey(target) && paymentsWebhookSecret(target));
}

/** The environment this deployment charges in. Single source of truth. */
export function paymentsEnv(): PaymentsEnv {
  const isProductionBuild = Boolean(import.meta.env?.PROD);
  if (!isProductionBuild) return "sandbox";
  return paymentsConfiguredFor("live") ? "live" : paymentsConfiguredFor("sandbox") ? "sandbox" : "live";
}

/** Checkout usable right now (create + confirm) in the active environment. */
export function paymentsReady(): boolean {
  return paymentsConfiguredFor(paymentsEnv());
}

/** Paddle.js token for the active environment — sent to the browser by the server. */
export function paymentsClientToken(env: PaymentsEnv = paymentsEnv()): string {
  return envVar(env === "live" ? "PADDLE_LIVE_CLIENT_TOKEN" : "PADDLE_SANDBOX_CLIENT_TOKEN") ?? CLIENT_TOKEN[env];
}
