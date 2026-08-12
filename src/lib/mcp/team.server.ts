/**
 * Team access for a published Presence — still completely accountless.
 *
 * The owner (whoever holds the recovery code) can issue additional named team
 * codes for a Business Presence. A team code is `<slug>~tm_<64 hex>`: 256 bits
 * of entropy, shown once, stored only as a SHA-256 hash. A team code grants
 * read access to status and analytics ("viewer") or additionally lets the
 * holder take the Presence offline/online ("editor"). It never grants billing
 * access, secret rotation or team management — those stay with the owner code.
 */
import { opaqueToken } from "./sessions";
import { PresenceStoreError } from "./presences";

export type TeamRole = "viewer" | "editor";

export type TeamMember = {
  id: string;
  label: string;
  role: TeamRole;
  createdAt: string;
  lastUsedAt: string | null;
};

export const TEAM_SECRET_BYTES = 32;
export const TEAM_SECRET_PATTERN = /^tm_[a-f0-9]{64}$/;

const UNAVAILABLE =
  "The Crawler database is temporarily unavailable, so this action was not performed. Nothing was changed — please try again in a moment.";

function fail(operation: string, detail: string): never {
  console.error(`[crawler] team store failure (${operation})`, detail);
  throw new PresenceStoreError(UNAVAILABLE);
}

async function client() {
  const { db } = await import("./db.server");
  const supabase = db();
  if (!supabase) throw new PresenceStoreError(UNAVAILABLE);
  return supabase;
}

export function newTeamSecret(): string {
  return opaqueToken("tm", TEAM_SECRET_BYTES);
}

export function teamCode(slug: string, secret: string): string {
  return `${slug}~${secret}`;
}

export function parseTeamCode(value: string): { slug: string; secret: string } | null {
  const trimmed = value.trim();
  const at = trimmed.indexOf("~");
  if (at <= 0) return null;
  const slug = trimmed.slice(0, at);
  const secret = trimmed.slice(at + 1);
  if (!/^[a-z0-9-]{1,120}$/.test(slug) || !TEAM_SECRET_PATTERN.test(secret)) return null;
  return { slug, secret };
}

async function hashTeamSecret(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(`crawler-team-v1:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Row = {
  id: string;
  label: string;
  role: string;
  created_at: string;
  last_used_at: string | null;
};

const toMember = (row: Row): TeamMember => ({
  id: row.id,
  label: row.label,
  role: row.role === "editor" ? "editor" : "viewer",
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
});

export async function listTeam(slug: string): Promise<TeamMember[]> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("presence_team_members")
    .select("id, label, role, created_at, last_used_at")
    .eq("presence_slug", slug)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });
  if (error) fail("list", error.message);
  return (data as Row[] | null)?.map(toMember) ?? [];
}

/** Issues a new team code. The raw code is returned exactly once. */
export async function addTeamMember(
  slug: string,
  label: string,
  role: TeamRole,
): Promise<{ member: TeamMember; code: string }> {
  const supabase = await client();
  const secret = newTeamSecret();
  const { data, error } = await supabase
    .from("presence_team_members")
    .insert({ presence_slug: slug, label, role, code_hash: await hashTeamSecret(secret) })
    .select("id, label, role, created_at, last_used_at")
    .single();
  if (error || !data) fail("insert", error?.message ?? "no row returned");
  return { member: toMember(data as Row), code: teamCode(slug, secret) };
}

export async function revokeTeamMember(slug: string, id: string): Promise<void> {
  const supabase = await client();
  const { error } = await supabase
    .from("presence_team_members")
    .update({ revoked_at: new Date().toISOString() })
    .eq("presence_slug", slug)
    .eq("id", id);
  if (error) fail("revoke", error.message);
}

/** Verifies a team code and records the use. Returns null when it is unknown or revoked. */
export async function verifyTeamCode(code: string): Promise<{ slug: string; role: TeamRole; label: string } | null> {
  const parsed = parseTeamCode(code);
  if (!parsed) return null;
  const supabase = await client();
  const { data, error } = await supabase
    .from("presence_team_members")
    .select("id, label, role, created_at, last_used_at")
    .eq("presence_slug", parsed.slug)
    .eq("code_hash", await hashTeamSecret(parsed.secret))
    .is("revoked_at", null)
    .maybeSingle();
  if (error) fail("verify", error.message);
  if (!data) return null;

  const member = toMember(data as Row);
  const { error: touchError } = await supabase
    .from("presence_team_members")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", member.id);
  if (touchError) fail("touch", touchError.message);

  return { slug: parsed.slug, role: member.role, label: member.label };
}
