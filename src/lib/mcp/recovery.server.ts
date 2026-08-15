/**
 * Owner recovery for published Presences.
 *
 * Rules (tested in `tests/recovery.test.ts`):
 *  - Only the independent management capability (`<slug>~crw_…`) proves
 *    ownership. A draft session id (`sess_…`) never does.
 *  - Reissuing a draft session capability returns the raw value exactly once;
 *    only its hash is persisted, and the previous mapping is replaced in the
 *    same write, so the old session stops resolving to the Presence.
 *  - A Presence without a usable independent capability is NOT silently given
 *    a new hidden token. It is flagged `admin_assist_required` and recovery
 *    becomes an explicit, auditable admin action.
 *  - The paid subscription stays attached to the Presence by its internal ids
 *    (slug, billing_customer_id, billing_subscription_id) and is never touched
 *    by a capability rotation.
 */
import { hashSessionToken } from "./presences";
import { opaqueToken } from "./sessions";

export type RecoveryState = "ok" | "admin_assist_required";

export type ReissueResult =
  | { ok: true; sessionToken: string; slug: string }
  | { ok: false; reason: "not-found" | "admin-assist-required" | "unavailable" };

async function client() {
  const { db } = await import("./db.server");
  return db();
}

export function newSessionCapability(): string {
  return opaqueToken("sess", 24);
}

export async function recoveryStateFor(slug: string): Promise<RecoveryState | null> {
  const supabase = await client();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("published_presences")
    .select("recovery_state, manage_secret_hash")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { recovery_state: string | null; manage_secret_hash: string | null };
  if (!row.manage_secret_hash) return "admin_assist_required";
  return row.recovery_state === "admin_assist_required" ? "admin_assist_required" : "ok";
}

/**
 * Issues a fresh draft session capability for an already-verified owner.
 * The caller MUST have verified the management secret first.
 */
export async function reissueSessionCapability(slug: string): Promise<ReissueResult> {
  const supabase = await client();
  if (!supabase) return { ok: false, reason: "unavailable" };

  const state = await recoveryStateFor(slug);
  if (state === null) return { ok: false, reason: "not-found" };
  if (state === "admin_assist_required") return { ok: false, reason: "admin-assist-required" };

  const sessionToken = newSessionCapability();
  const hash = await hashSessionToken(sessionToken);
  // One atomic write: the new mapping replaces the previous one, so any older
  // session capability (including a rotated/leaked one) stops resolving here.
  const { data, error } = await supabase
    .from("published_presences")
    .update({ session_token: null, session_token_hash: hash })
    .eq("slug", slug)
    .select("slug");
  if (error || !data || data.length !== 1) return { ok: false, reason: "unavailable" };
  return { ok: true, sessionToken, slug };
}

/** Files an auditable admin-assisted recovery request. Never proves ownership. */
export async function requestAdminAssistedRecovery(input: {
  slug: string;
  contact?: string | null;
  evidence?: string | null;
}): Promise<{ ok: boolean }> {
  const supabase = await client();
  if (!supabase) return { ok: false };
  const { error } = await supabase.from("presence_recovery_requests").insert({
    slug: input.slug,
    contact: input.contact ?? null,
    evidence: input.evidence ?? null,
    status: "open",
  });
  return { ok: !error };
}
