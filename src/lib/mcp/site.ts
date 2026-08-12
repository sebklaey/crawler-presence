type RuntimeGlobals = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

function env(name: string): string | undefined {
  return (globalThis as RuntimeGlobals).process?.env?.[name]?.trim() || undefined;
}

/** Public web URL of the Crawler site, used for checkout and manage links. */
export function siteUrl(): string {
  return (env("PUBLIC_SITE_URL") ?? "https://crawler.today").replace(/\/$/, "");
}

/** Which Paddle environment this deployment charges in (mirrors paddle.server). */
export function paymentsEnvironment(): "sandbox" | "live" {
  const forced = env("PADDLE_ENV");
  if (forced === "sandbox" || forced === "live") return forced;
  const isProduction = env("NODE_ENV") === "production";
  if (isProduction && env("PADDLE_LIVE_API_KEY")) return "live";
  if (env("PADDLE_SANDBOX_API_KEY")) return "sandbox";
  return env("PADDLE_LIVE_API_KEY") ? "live" : "sandbox";
}

/**
 * No invented secrets: a real charge needs both an API key and the webhook
 * secret that later confirms the payment. Otherwise the tools report demo mode.
 */
export function paymentsConfigured(): boolean {
  const target = paymentsEnvironment();
  const key = target === "live" ? env("PADDLE_LIVE_API_KEY") : env("PADDLE_SANDBOX_API_KEY");
  const secret =
    env(target === "live" ? "PAYMENTS_LIVE_WEBHOOK_SECRET" : "PAYMENTS_SANDBOX_WEBHOOK_SECRET") ??
    env(target === "live" ? "PADDLE_LIVE_WEBHOOK_SECRET" : "PADDLE_SANDBOX_WEBHOOK_SECRET") ??
    env("PADDLE_WEBHOOK_SECRET");
  return Boolean((key ?? env("PADDLE_API_KEY")) && secret);
}


/**
 * Free Beta gate. Until real Paddle live payments are configured, publishing is
 * free (Crawler Free Beta 0.0.1). As soon as live credentials exist, the paid
 * normal operation (0.0.2) takes over automatically — no code change needed.
 */
export function betaFree(): boolean {
  return !paymentsConfigured();
}

export function releaseVersion(): "0.0.1" | "0.0.2" {
  return betaFree() ? "0.0.1" : "0.0.2";
}
