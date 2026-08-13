import { paymentsEnv, paymentsReady } from "../payments-config";
  process?: { env?: Record<string, string | undefined> };
};

function env(name: string): string | undefined {
  return (globalThis as RuntimeGlobals).process?.env?.[name]?.trim() || undefined;
}

/** Public web URL of the Crawler site, used for checkout and manage links. */
export function siteUrl(): string {
  return (env("PUBLIC_SITE_URL") ?? "https://crawler.today").replace(/\/$/, "");
}

/** Which payment environment this deployment charges in (single source of truth). */
export function paymentsEnvironment(): "sandbox" | "live" {
  return paymentsEnv();
}

/**
 * No invented secrets: a real charge needs both an API key and the webhook
 * secret that later confirms the payment. Otherwise the tools report that
 * checkout is unavailable.
 */
export function paymentsConfigured(): boolean {
  return paymentsReady();
}



/**
 * Free Beta is over. Crawler runs in paid operation (Alpha 0.0.2): hosting a
 * Presence always requires an active paid subscription.
 */
export function betaFree(): boolean {
  return false;
}

export function releaseVersion(): "0.0.2" {
  return "0.0.2";
}
