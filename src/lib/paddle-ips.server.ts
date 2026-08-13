/**
 * Paddle webhook IP allowlist.
 *
 * The list is fetched from Paddle itself (https://api.paddle.com/ips) and never
 * hard-coded — Paddle can change it at any time. Result is cached in memory for
 * an hour. If Paddle cannot be reached the allowlist is skipped for that
 * request: HMAC signature verification stays the hard security boundary, the
 * IP check is defence in depth.
 */
const IPS_URL = "https://api.paddle.com/ips";
const TTL_MS = 60 * 60 * 1000;

let cache: { ips: Set<string>; fetchedAt: number } | null = null;

async function paddleIps(): Promise<Set<string> | null> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.ips;
  try {
    const response = await fetch(IPS_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { data?: { ipv4_cidrs?: string[] } };
    const cidrs = payload.data?.ipv4_cidrs ?? [];
    if (!cidrs.length) throw new Error("empty ipv4_cidrs");
    // Paddle publishes single addresses as /32 CIDRs.
    cache = { ips: new Set(cidrs.map((cidr) => cidr.split("/")[0]!)), fetchedAt: Date.now() };
    return cache.ips;
  } catch (error) {
    console.error("[crawler] could not fetch Paddle IP list:", error);
    return cache?.ips ?? null;
  }
}

/** Best-effort caller IP behind the edge proxy. */
export function callerIp(request: Request): string | null {
  const direct = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip");
  if (direct) return direct.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? (forwarded.split(",")[0]?.trim() ?? null) : null;
}

/**
 * Rejects anything that is not a published Paddle address. Unknown source IP
 * (no proxy header) and an unreachable IP endpoint both pass through to
 * signature verification instead of dropping a real event.
 */
export async function isPaddleRequest(request: Request): Promise<boolean> {
  const ip = callerIp(request);
  if (!ip) return true;
  const allowed = await paddleIps();
  if (!allowed) return true;
  return allowed.has(ip);
}
