/**
 * Shared SSRF protection for every outbound fetch of a user-supplied URL.
 *
 * Only public https hosts are reachable, redirects are followed manually so
 * every hop is revalidated, and responses are capped in size and time.
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "169.254.169.254"]);

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b].some((n) => Number.isNaN(n) || n > 255)) return true;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** Rejects anything that is not a public https URL. */
export function assertPublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That is not a valid URL.");
  }
  if (url.protocol !== "https:") throw new Error("Only https:// URLs are allowed.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host)) throw new Error("That host is not allowed.");
  if (host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    throw new Error("Only public hostnames are allowed.");
  }
  if (isPrivateIPv4(host)) throw new Error("Private network addresses are not allowed.");
  if (host.includes(":") || host === "::1") throw new Error("Raw IPv6 addresses are not allowed.");
  if (url.username || url.password) throw new Error("Credentials in the URL are not allowed.");
  return url;
}

export type SafeFetchResult = {
  ok: boolean;
  status: number | null;
  url: string;
  text: string;
  bytes: number;
  contentType: string;
  error?: string;
};

export type SafeFetchOptions = {
  accept: string;
  userAgent: string;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
  /** Response content types that may be read, tested against the header. */
  allowedContentType: RegExp;
};

/**
 * Fetches a public https URL with every redirect hop revalidated against
 * `assertPublicHttpsUrl`, so a public host cannot bounce the request into the
 * internal network or the cloud metadata service.
 */
export async function fetchPublicUrl(
  rawUrl: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? 3;
  let current = assertPublicHttpsUrl(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const res = await fetch(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": options.userAgent, accept: options.accept },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location)
          return {
            ok: false,
            status: res.status,
            url: current.toString(),
            text: "",
            bytes: 0,
            contentType: "",
            error: "Redirect without target",
          };
        current = assertPublicHttpsUrl(new URL(location, current).toString());
        continue;
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok)
        return {
          ok: false,
          status: res.status,
          url: current.toString(),
          text: "",
          bytes: 0,
          contentType,
          error: `HTTP ${res.status}`,
        };
      if (!options.allowedContentType.test(contentType)) {
        return {
          ok: false,
          status: res.status,
          url: current.toString(),
          text: "",
          bytes: 0,
          contentType,
          error: `Unsupported content type: ${contentType}`,
        };
      }

      const clipped = (await res.text()).slice(0, options.maxBytes);
      return {
        ok: true,
        status: res.status,
        url: current.toString(),
        text: clipped,
        bytes: clipped.length,
        contentType,
      };
    } catch (e) {
      return {
        ok: false,
        status: null,
        url: current.toString(),
        text: "",
        bytes: 0,
        contentType: "",
        error:
          e instanceof Error ? (e.name === "AbortError" ? "Timed out" : e.message) : "Fetch failed",
      };
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    ok: false,
    status: null,
    url: current.toString(),
    text: "",
    bytes: 0,
    contentType: "",
    error: "Too many redirects",
  };
}
