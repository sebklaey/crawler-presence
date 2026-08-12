type RuntimeGlobals = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

function env(name: string): string | undefined {
  return (globalThis as RuntimeGlobals).process?.env?.[name]?.trim() || undefined;
}

/** Public web URL of the Crawler site, used for checkout / account-link links. */
export function siteUrl(): string {
  return (env("PUBLIC_SITE_URL") ?? "https://crawler-presence.lovable.app").replace(/\/$/, "");
}

/** No invented secrets: without Paddle credentials the checkout tool reports demo mode. */
export function paymentsConfigured(): boolean {
  return Boolean(
    env("PADDLE_API_KEY") && env("PADDLE_PRICE_PLUS") && env("PADDLE_PRICE_PRO") && env("PADDLE_PRICE_BUSINESS"),
  );
}
