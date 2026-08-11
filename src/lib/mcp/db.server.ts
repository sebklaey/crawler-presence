/**
 * Server-only Supabase access for the public MCP server and the website's
 * publish flow.
 *
 * The tables (mcp_sessions, published_presences, mcp_rate_limits) are
 * RLS-locked with no policies, so neither `anon` nor `authenticated` can read
 * them. Only this server-side client (service role) can. The service role key
 * is never sent to the browser: this module is `.server.ts` and is only ever
 * loaded through `await import()` inside server-side handlers.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type RuntimeGlobals = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

function env(name: string): string | undefined {
  return (globalThis as RuntimeGlobals).process?.env?.[name]?.trim() || undefined;
}

let cached: SupabaseClient | null = null;

/** Returns null when the backend is not configured, so callers can fall back. */
export function db(): SupabaseClient | null {
  if (cached) return cached;
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
