type RuntimeGlobals = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

function env(name: string): string | undefined {
  return (globalThis as RuntimeGlobals).process?.env?.[name]?.trim() || undefined;
}

/** Public web URL of the Crawler site, used for checkout / account-link links. */
export function siteUrl(): string {
  return (env("PUBLIC_SITE_URL") ?? "https://crawler.lovable.app").replace(/\/$/, "");
}

/** No invented secrets: without a Stripe key the checkout tool reports demo mode. */
export function stripeConfigured(): boolean {
  return Boolean(env("STRIPE_SECRET_KEY"));
}
