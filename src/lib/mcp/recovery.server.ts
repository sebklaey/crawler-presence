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
/**
 * Issues a fresh draft session capability for an already-verified owner.
 * The caller MUST have verified the independent management secret first.
 *
 * The whole rotation happens inside one database routine
 * (`reissue_presence_session`), so the Presence hash, the revocation of the
 * old session→identity mappings and the new mapping either all apply or none
 * do. Billing ids, plan and content are never touched. Only the hash is
 * stored; the raw capability is returned exactly once.
 */
export async function reissueSessionCapability(slug: string): Promise<ReissueResult> {
  const supabase = await client();
  if (!supabase) return { ok: false, reason: "unavailable" };

  const sessionToken = newSessionCapability();
  const hash = await hashSessionToken(sessionToken);

  const { data, error } = await supabase.rpc("reissue_presence_session", {
    p_slug: slug,
    p_new_session_hash: hash,
    p_old_session_hash: null,
  });
  if (error) return { ok: false, reason: "unavailable" };
  const result = (data ?? null) as { ok?: boolean; reason?: string } | null;
  if (!result?.ok) {
    const reason = result?.reason;
    if (reason === "not-found") return { ok: false, reason: "not-found" };
    if (reason === "admin-assist-required") return { ok: false, reason: "admin-assist-required" };
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, sessionToken, slug };
}

/** Files an auditable admin-assisted recovery request. Never proves ownership. */
export async function requestAdminAssistedRecovery(input: {
  slug: string;
  contact?: string | null;
  evidence?: string | null;
}): Promise<{ ok: boolean; deduplicated?: boolean; reason?: "rate-limited" | "unavailable" }> {
  const supabase = await client();
  if (!supabase) return { ok: false, reason: "unavailable" };

  const { allowRequest } = await import("./presences");
  if (!(await allowRequest(`recovery-request:${input.slug}`, 3))) {
    return { ok: false, reason: "rate-limited" };
  }

  // Deduplicated by the partial unique index on (slug) WHERE status = 'open':
  // a repeated request bumps the counter instead of creating a second ticket.
  const { data: existing } = await supabase
    .from("presence_recovery_requests")
    .select("id, request_count")
    .eq("slug", input.slug)
    .eq("status", "open")
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; request_count: number | null };
    const { error } = await supabase
      .from("presence_recovery_requests")
      .update({
        request_count: (row.request_count ?? 1) + 1,
        last_requested_at: new Date().toISOString(),
        ...(input.contact ? { contact: input.contact } : {}),
      })
      .eq("id", row.id);
    return error ? { ok: false, reason: "unavailable" } : { ok: true, deduplicated: true };
  }

  // Minimal data only: slug, an optional contact, a short free-text evidence
  // note. No capability, no token, no request body is ever stored here, and
  // the row deletes itself after the retention window (delete_after).
  const { error } = await supabase.from("presence_recovery_requests").insert({
    slug: input.slug,
    contact: input.contact ?? null,
    evidence: input.evidence ? input.evidence.slice(0, 500) : null,
    status: "open",
  });
  if (error && (error as { code?: string }).code === "23505") return { ok: true, deduplicated: true };
  return error ? { ok: false, reason: "unavailable" } : { ok: true };
}
