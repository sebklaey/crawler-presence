/**
 * Published presences and simple rate limiting for the public MCP server.
 * Both live behind the RLS-locked service-role client in `db.server.ts`.
 *
 * Ownership is capability-based and completely accountless: a published
 * Presence is controlled by a high-entropy management secret that is shown to
 * the user exactly once, at publish time. Only a SHA-256 hash is stored, so a
 * database dump never yields a working secret and Crawler itself cannot
 * recover a lost one.
 */
import { generatedFiles, presenceSlug, type KnowledgeCore } from "../knowledge";
import { opaqueToken } from "./sessions";

export type PublishMode = "demo" | "live";
export type PresenceStatus = "live" | "offline";

export type PublishedPresence = {
  slug: string;
  core: KnowledgeCore;
  files: { path: string; type: string; content: string }[];
  plan: string;
  mode: PublishMode;
  status: PresenceStatus;
  publishedAt: string;
  intentRef: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  billingCustomerId: string | null;
  billingSubscriptionId: string | null;
  manageSecretUpdatedAt: string | null;
};

type MemoryRecord = PublishedPresence & { manageSecretHash: string };

const memory = new Map<string, MemoryRecord>();

async function client() {
  try {
    const { db } = await import("./db.server");
    return db();
  } catch {
    return null;
  }
}

function randomSuffix() {
  const buf = new Uint8Array(3);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ */
/* Management secret (capability-based ownership)                      */
/* ------------------------------------------------------------------ */

/** 160 bits of entropy. Shown once, never stored in raw form. */
export function newManageSecret(): string {
  return opaqueToken("crw", 20);
}

export async function hashManageSecret(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(`crawler-manage-v1:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The single string a user copies or downloads: `<slug>~<secret>`. */
export function recoveryCode(slug: string, secret: string): string {
  return `${slug}~${secret}`;
}

export function parseRecoveryCode(value: string): { slug: string; secret: string } | null {
  const trimmed = value.trim();
  const at = trimmed.indexOf("~");
  if (at <= 0) return null;
  const slug = trimmed.slice(0, at);
  const secret = trimmed.slice(at + 1);
  if (!/^[a-z0-9-]{1,120}$/.test(slug) || !/^crw_[a-f0-9]{40}$/.test(secret)) return null;
  return { slug, secret };
}

/* ------------------------------------------------------------------ */
/* Publishing                                                          */
/* ------------------------------------------------------------------ */

const COLUMNS =
  "slug, core, files, plan, mode, status, intent_ref, subscription_status, current_period_end, billing_customer_id, billing_subscription_id, manage_secret_updated_at, created_at";

type Row = {
  slug: string;
  core: KnowledgeCore;
  files: PublishedPresence["files"] | null;
  plan: string;
  mode: string;
  status: string;
  intent_ref: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  billing_customer_id: string | null;
  billing_subscription_id: string | null;
  manage_secret_updated_at: string | null;
  created_at: string;
};

function fromRow(row: Row): PublishedPresence {
  return {
    slug: row.slug,
    core: row.core,
    files: row.files ?? [],
    plan: row.plan,
    mode: row.mode === "live" ? "live" : "demo",
    status: row.status === "offline" ? "offline" : "live",
    publishedAt: row.created_at,
    intentRef: row.intent_ref,
    subscriptionStatus: row.subscription_status,
    currentPeriodEnd: row.current_period_end,
    billingCustomerId: row.billing_customer_id,
    billingSubscriptionId: row.billing_subscription_id,
    manageSecretUpdatedAt: row.manage_secret_updated_at,
  };
}

export type PublishResult = { presence: PublishedPresence; manageSecret: string };

/**
 * Publish a draft. Returns the raw management secret exactly once — the caller
 * must hand it to the user immediately and must never persist it.
 */
export async function publishDraft(input: {
  core: KnowledgeCore;
  plan: string;
  mode: PublishMode;
  sessionToken?: string | undefined;
  intentRef?: string | undefined;
  billing?:
    | {
        billingCustomerId?: string | null;
        billingSubscriptionId?: string | null;
        subscriptionStatus?: string | null;
        currentPeriodEnd?: string | null;
      }
    | undefined;
}): Promise<PublishResult> {
  const files = generatedFiles(input.core).map((f) => ({ path: f.path, type: f.type, content: f.content }));
  const manageSecret = newManageSecret();
  const manageSecretHash = await hashManageSecret(manageSecret);
  const now = new Date().toISOString();

  const presence: PublishedPresence = {
    slug: `${presenceSlug(input.core)}-${randomSuffix()}`,
    core: input.core,
    files,
    plan: input.plan,
    mode: input.mode,
    status: "live",
    publishedAt: now,
    intentRef: input.intentRef ?? null,
    subscriptionStatus: input.billing?.subscriptionStatus ?? null,
    currentPeriodEnd: input.billing?.currentPeriodEnd ?? null,
    billingCustomerId: input.billing?.billingCustomerId ?? null,
    billingSubscriptionId: input.billing?.billingSubscriptionId ?? null,
    manageSecretUpdatedAt: now,
  };

  const supabase = await client();
  if (supabase) {
    const { error } = await supabase.from("published_presences").insert({
      slug: presence.slug,
      session_token: input.sessionToken ?? null,
      core: presence.core,
      files: presence.files,
      plan: presence.plan,
      mode: presence.mode,
      status: "live",
      manage_secret_hash: manageSecretHash,
      manage_secret_updated_at: now,
      intent_ref: input.intentRef ?? null,
      billing_customer_id: input.billing?.billingCustomerId ?? null,
      billing_subscription_id: input.billing?.billingSubscriptionId ?? null,
      subscription_status: input.billing?.subscriptionStatus ?? null,
      current_period_end: input.billing?.currentPeriodEnd ?? null,
    });
    if (!error) return { presence, manageSecret };
    console.error("[crawler] presence insert failed", error.message);
  }

  memory.set(presence.slug, { ...presence, manageSecretHash });
  return { presence, manageSecret };
}

export async function getPublished(slug: string): Promise<PublishedPresence | undefined> {
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,120}$/.test(slug)) return undefined;
  const supabase = await client();
  if (supabase) {
    const { data } = await supabase.from("published_presences").select(COLUMNS).eq("slug", slug).maybeSingle();
    if (data) return fromRow(data as Row);
  }
  const local = memory.get(slug);
  if (!local) return undefined;
  const { manageSecretHash: _hash, ...rest } = local;
  return rest;
}

/** Only a live presence is served publicly. */
export async function getLivePresence(slug: string): Promise<PublishedPresence | undefined> {
  const record = await getPublished(slug);
  return record && record.status === "live" ? record : undefined;
}

/* ------------------------------------------------------------------ */
/* Capability checks and management                                    */
/* ------------------------------------------------------------------ */

/** Verifies the management secret for a slug. Returns null on any mismatch. */
export async function verifyManageSecret(slug: string, secret: string): Promise<PublishedPresence | null> {
  if (!/^[a-z0-9-]{1,120}$/.test(slug) || !/^crw_[a-f0-9]{40}$/.test(secret)) return null;
  const provided = await hashManageSecret(secret);

  const supabase = await client();
  if (supabase) {
    const { data } = await supabase
      .from("published_presences")
      .select(`${COLUMNS}, manage_secret_hash`)
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return null;
    const row = data as Row & { manage_secret_hash: string | null };
    if (!row.manage_secret_hash || !constantTimeEqual(row.manage_secret_hash, provided)) return null;
    return fromRow(row);
  }

  const local = memory.get(slug);
  if (!local || !constantTimeEqual(local.manageSecretHash, provided)) return null;
  const { manageSecretHash: _hash, ...rest } = local;
  return rest;
}

/** Issues a new management secret and invalidates the old one. Shown once. */
export async function rotateManageSecret(slug: string): Promise<string> {
  const secret = newManageSecret();
  const hash = await hashManageSecret(secret);
  const now = new Date().toISOString();

  const supabase = await client();
  if (supabase) {
    await supabase
      .from("published_presences")
      .update({ manage_secret_hash: hash, manage_secret_updated_at: now })
      .eq("slug", slug);
  }
  const local = memory.get(slug);
  if (local) memory.set(slug, { ...local, manageSecretHash: hash, manageSecretUpdatedAt: now });
  return secret;
}

export async function setPresenceStatus(slug: string, status: PresenceStatus): Promise<void> {
  const supabase = await client();
  if (supabase) {
    await supabase
      .from("published_presences")
      .update({ status, unpublished_at: status === "offline" ? new Date().toISOString() : null })
      .eq("slug", slug);
  }
  const local = memory.get(slug);
  if (local) memory.set(slug, { ...local, status });
}

/** Keeps a presence in sync with subscription lifecycle events. */
export async function syncPresenceBilling(
  billingSubscriptionId: string,
  billing: { subscriptionStatus?: string | null; currentPeriodEnd?: string | null },
): Promise<void> {
  const supabase = await client();
  if (!supabase) return;
  await supabase
    .from("published_presences")
    .update({
      subscription_status: billing.subscriptionStatus ?? null,
      current_period_end: billing.currentPeriodEnd ?? null,
    })
    .eq("billing_subscription_id", billingSubscriptionId);
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

const RATE_WINDOW_MS = 60_000;
const memoryHits = new Map<string, { window: number; hits: number }>();

/** Fixed-window counter. Returns false when the caller exceeded `limit`. */
export async function allowRequest(bucketKey: string, limit: number): Promise<boolean> {
  const windowStart = Math.floor(Date.now() / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  const supabase = await client();
  if (supabase) {
    const iso = new Date(windowStart).toISOString();
    const { data } = await supabase
      .from("mcp_rate_limits")
      .select("id, hits")
      .eq("bucket_key", bucketKey)
      .eq("window_start", iso)
      .maybeSingle();
    if (data) {
      const row = data as { id: string; hits: number };
      if (row.hits >= limit) return false;
      await supabase.from("mcp_rate_limits").update({ hits: row.hits + 1 }).eq("id", row.id);
      return true;
    }
    const { error } = await supabase
      .from("mcp_rate_limits")
      .insert({ bucket_key: bucketKey, window_start: iso, hits: 1 });
    if (!error) return true;
  }

  const local = memoryHits.get(bucketKey);
  if (!local || local.window !== windowStart) {
    memoryHits.set(bucketKey, { window: windowStart, hits: 1 });
    return true;
  }
  if (local.hits >= limit) return false;
  local.hits += 1;
  return true;
}
