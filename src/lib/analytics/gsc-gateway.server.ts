/**
 * Search Console through the Lovable connector gateway.
 *
 * This is the one-click path: the workspace connection already holds the
 * Google authorisation, so the user never types a property, a key or a
 * service account. If the gateway credentials are missing the caller falls
 * back to the service-account path in `google-auth.server.ts`.
 */
type RuntimeGlobals = typeof globalThis & { process?: { env?: Record<string, string | undefined> } };

function env(name: string): string | undefined {
  return (globalThis as RuntimeGlobals).process?.env?.[name]?.trim() || undefined;
}

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

export function gscGatewayAvailable(): boolean {
  return Boolean(env("LOVABLE_API_KEY") && env("GOOGLE_SEARCH_CONSOLE_API_KEY"));
}

function headers(): Record<string, string> {
  return {
    authorization: `Bearer ${env("LOVABLE_API_KEY")}`,
    "X-Connection-Api-Key": env("GOOGLE_SEARCH_CONSOLE_API_KEY")!,
    "content-type": "application/json",
  };
}

export type GscProperty = { siteUrl: string; permissionLevel: string };

/** Verified properties the connected Google account can read. */
export async function listGscProperties(): Promise<{ ok: boolean; properties: GscProperty[]; error?: string }> {
  if (!gscGatewayAvailable()) return { ok: false, properties: [], error: "Search Console is not connected." };
  const response = await fetch(`${GATEWAY}/webmasters/v3/sites`, { headers: headers() });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 300);
    return { ok: false, properties: [], error: `Search Console [${response.status}]: ${text}` };
  }
  const body = (await response.json()) as { siteEntry?: GscProperty[] };
  const properties = (body.siteEntry ?? []).filter((entry) => entry.permissionLevel !== "siteUnverifiedUser");
  return { ok: true, properties };
}

/** Picks the property that best covers a website, or the only one available. */
export function pickProperty(properties: GscProperty[], website?: string | null): GscProperty | null {
  if (!properties.length) return null;
  if (website) {
    let host = "";
    try {
      host = new URL(website.startsWith("http") ? website : `https://${website}`).hostname.toLowerCase();
    } catch {
      host = "";
    }
    if (host) {
      const match = properties.find((entry) => {
        if (entry.siteUrl.startsWith("sc-domain:")) {
          const domain = entry.siteUrl.slice("sc-domain:".length).toLowerCase();
          return host === domain || host.endsWith(`.${domain}`);
        }
        try {
          return new URL(entry.siteUrl).hostname.toLowerCase() === host;
        } catch {
          return false;
        }
      });
      if (match) return match;
    }
  }
  return properties.length === 1 ? (properties[0] ?? null) : null;
}

export type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

export async function queryGscAnalytics(
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<{ ok: boolean; rows: GscRow[]; error?: string }> {
  const response = await fetch(
    `${GATEWAY}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["date", "query", "page", "country", "device"],
        rowLimit: 5000,
      }),
    },
  );
  if (!response.ok) {
    const text = (await response.text()).slice(0, 300);
    return { ok: false, rows: [], error: `Search Console [${response.status}]: ${text}` };
  }
  const body = (await response.json()) as { rows?: GscRow[] };
  return { ok: true, rows: body.rows ?? [] };
}
