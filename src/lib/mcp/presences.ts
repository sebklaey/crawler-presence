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
  updatedAt: string;
  /** Increases on every republication; lets AI clients detect changes. */
  version: number;
  intentRef: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  billingCustomerId: string | null;
  billingSubscriptionId: string | null;
  manageSecretUpdatedAt: string | null;
  /** Optional custom domain (Pro and Business). Only served once verified. */
  customDomain: string | null;
  customDomainToken: string | null;
  customDomainVerifiedAt: string | null;

};

type MemoryRecord = PublishedPresence & { manageSecretHash: string };

const memory = new Map<string, MemoryRecord>();

/**
 * Raised when the database is configured but a read or write failed. Callers
 * must fail closed: ownership, publishing and status changes are never served
 * from process memory while a real database exists, because a worker-local
 * fallback would silently diverge from the durable record.
 */
export class PresenceStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresenceStoreError";
  }
}

const UNAVAILABLE =
  "The Crawler database is temporarily unavailable, so this action was not performed. Nothing was changed — please try again in a moment.";

function storeFailure(operation: string, detail: string): never {
  // Never include secrets or hashes in logs.
  console.error(`[crawler] presence store failure (${operation})`, detail);
  throw new PresenceStoreError(UNAVAILABLE);
}

/** Returns the client, or null only when no database is configured at all. */
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

/** 256 bits of entropy (32 random bytes → `crw_` + 64 hex). Shown once, never stored raw. */
export const MANAGE_SECRET_BYTES = 32;
export const MANAGE_SECRET_PATTERN = /^crw_[a-f0-9]{64}$/;

export function newManageSecret(): string {
  return opaqueToken("crw", MANAGE_SECRET_BYTES);
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
  if (!/^[a-z0-9-]{1,120}$/.test(slug) || !MANAGE_SECRET_PATTERN.test(secret)) return null;
  return { slug, secret };
}

/* ------------------------------------------------------------------ */
/* Publishing                                                          */
/* ------------------------------------------------------------------ */

const COLUMNS =
  "slug, core, files, plan, mode, status, intent_ref, subscription_status, current_period_end, billing_customer_id, billing_subscription_id, manage_secret_updated_at, custom_domain, custom_domain_token, custom_domain_verified_at, created_at, updated_at, version";

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
  custom_domain: string | null;
  custom_domain_token: string | null;
  custom_domain_verified_at: string | null;
  created_at: string;
  updated_at?: string | null;
  version?: number | null;
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
    updatedAt: row.updated_at ?? row.created_at,
    version: row.version ?? 1,
    intentRef: row.intent_ref,
    subscriptionStatus: row.subscription_status,
    currentPeriodEnd: row.current_period_end,
    billingCustomerId: row.billing_customer_id,
    billingSubscriptionId: row.billing_subscription_id,
    manageSecretUpdatedAt: row.manage_secret_updated_at,
    customDomain: row.custom_domain,
    customDomainToken: row.custom_domain_token,
    customDomainVerifiedAt: row.custom_domain_verified_at,
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
  const { applyCatalogLimit } = await import("../entitlements");
  const visible = applyCatalogLimit(input.core, input.plan).core;
  const files = generatedFiles(visible).map((f) => ({ path: f.path, type: f.type, content: f.content }));

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
    updatedAt: now,
    version: 1,
    intentRef: input.intentRef ?? null,
    subscriptionStatus: input.billing?.subscriptionStatus ?? null,
    currentPeriodEnd: input.billing?.currentPeriodEnd ?? null,
    billingCustomerId: input.billing?.billingCustomerId ?? null,
    billingSubscriptionId: input.billing?.billingSubscriptionId ?? null,
    manageSecretUpdatedAt: now,
    customDomain: null,
    customDomainToken: null,
    customDomainVerifiedAt: null,
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
    if (error) storeFailure("publish", error.message);
    try {
      const { syncAliases } = await import("./presence-analytics");
      await syncAliases(presence.slug, presence.core);
    } catch {
      /* alias sync is best effort; publishing already succeeded */
    }
    try {
      // Baseline of what was true at publication, so later improvement can be
      // measured against a fixed starting point instead of a moving target.
      const { buildBaseline } = await import("../health");
      await saveBaseline(
        presence.slug,
        buildBaseline({ core: presence.core, conflicts: 0, endpointsChecked: presence.files.length, endpointsHealthy: presence.files.length }),
      );
    } catch {
      /* baseline capture is best effort */
    }
    return { presence, manageSecret };
  }

  // No database configured at all (local/demo runtime): keep it in memory.
  memory.set(presence.slug, { ...presence, manageSecretHash });
  return { presence, manageSecret };
}

export async function getPublished(slug: string): Promise<PublishedPresence | undefined> {
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,120}$/.test(slug)) return undefined;
  const supabase = await client();
  if (supabase) {
    const { data, error } = await supabase
      .from("published_presences")
      .select(COLUMNS)
      .eq("slug", slug)
      .maybeSingle();
    if (error) storeFailure("read", error.message);
    return data ? fromRow(data as Row) : undefined;
  }
  const local = memory.get(slug);
  if (!local) return undefined;
  const { manageSecretHash: _hash, ...rest } = local;
  return rest;
}

/**
 * Only a paid, live presence is served publicly. Since Alpha 0.0.2 publishing
 * is paid-only, so legacy `demo` records never reach the public web again.
 */
export async function getLivePresence(slug: string): Promise<PublishedPresence | undefined> {
  const record = await getPublished(slug);
  return record && record.status === "live" && record.mode === "live" ? record : undefined;
}

/* ------------------------------------------------------------------ */
/* Capability checks and management                                    */
/* ------------------------------------------------------------------ */

/** Verifies the management secret for a slug. Returns null on any mismatch. */
export async function verifyManageSecret(slug: string, secret: string): Promise<PublishedPresence | null> {
  if (!/^[a-z0-9-]{1,120}$/.test(slug) || !MANAGE_SECRET_PATTERN.test(secret)) return null;
  const provided = await hashManageSecret(secret);

  const supabase = await client();
  if (supabase) {
    const { data, error } = await supabase
      .from("published_presences")
      .select(`${COLUMNS}, manage_secret_hash`)
      .eq("slug", slug)
      .maybeSingle();
    if (error) storeFailure("verify", error.message);
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
    const { data, error } = await supabase
      .from("published_presences")
      .update({ manage_secret_hash: hash, manage_secret_updated_at: now })
      .eq("slug", slug)
      .select("slug");
    if (error) storeFailure("rotate", error.message);
    if (!data || data.length !== 1) storeFailure("rotate", `unexpected affected rows: ${data?.length ?? 0}`);
    return secret;
  }
  const local = memory.get(slug);
  if (!local) storeFailure("rotate", "unknown presence");
  memory.set(slug, { ...local, manageSecretHash: hash, manageSecretUpdatedAt: now });
  return secret;
}

export async function setPresenceStatus(slug: string, status: PresenceStatus): Promise<void> {
  const supabase = await client();
  if (supabase) {
    const { data, error } = await supabase
      .from("published_presences")
      .update({ status, unpublished_at: status === "offline" ? new Date().toISOString() : null })
      .eq("slug", slug)
      .select("slug");
    if (error) storeFailure("status", error.message);
    if (!data || data.length !== 1) storeFailure("status", `unexpected affected rows: ${data?.length ?? 0}`);
    return;
  }
  const local = memory.get(slug);
  if (!local) storeFailure("status", "unknown presence");
  memory.set(slug, { ...local, status });
}

/**
 * Republishes an existing Presence from an updated Knowledge Core.
 *
 * Used by the improvement workflow after the owner approved a change: the
 * public files are regenerated, the version counter increases and the change
 * only becomes public once this write succeeded.
 */
export async function republishCore(slug: string, core: KnowledgeCore): Promise<PublishedPresence> {
  const existing = await getPublished(slug);
  if (!existing) storeFailure("republish", "unknown presence");

  const { applyCatalogLimit } = await import("../entitlements");
  const visible = applyCatalogLimit(core, existing.plan).core;
  const files = generatedFiles(visible).map((f) => ({ path: f.path, type: f.type, content: f.content }));
  const now = new Date().toISOString();

  const supabase = await client();
  if (supabase) {
    const { data, error } = await supabase
      .from("published_presences")
      .update({
        core,
        files,
        version: existing.version + 1,
        publication_state: "published",
        publication_error: null,
        updated_at: now,
      })
      .eq("slug", slug)
      .select("slug");
    if (error) storeFailure("republish", error.message);
    if (!data || data.length !== 1) storeFailure("republish", `unexpected affected rows: ${data?.length ?? 0}`);
    try {
      const { syncAliases } = await import("./presence-analytics");
      await syncAliases(slug, core);
    } catch {
      /* alias sync is best effort */
    }
  } else {
    const local = memory.get(slug);
    if (!local) storeFailure("republish", "unknown presence");
    memory.set(slug, { ...local, core, files, version: local.version + 1, updatedAt: now });
  }

  return { ...existing, core, files, version: existing.version + 1, updatedAt: now };
}

/** Stores the post-publication baseline exactly once per Presence. */
export async function saveBaseline(slug: string, baseline: unknown): Promise<void> {
  const supabase = await client();
  if (!supabase) return;
  await supabase
    .from("published_presences")
    .update({ baseline, baseline_at: new Date().toISOString() })
    .eq("slug", slug)
    .is("baseline", null);
}


/**
 * Keeps a presence in sync with subscription lifecycle events.
 *
 * A plan change takes effect immediately: the stored plan is updated and the
 * public files are regenerated so the new catalog limit applies at once. A
 * canceled or past-due subscription only changes the status — the Presence
 * stays online and simply becomes restricted in management.
 */
export async function syncPresenceBilling(
  billingSubscriptionId: string,
  billing: { subscriptionStatus?: string | null; currentPeriodEnd?: string | null; plan?: string | null },
): Promise<void> {
  const supabase = await client();
  if (!supabase) return;

  const patch: Record<string, unknown> = {
    subscription_status: billing.subscriptionStatus ?? null,
    current_period_end: billing.currentPeriodEnd ?? null,
  };

  if (billing.plan) {
    patch["plan"] = billing.plan;
    const { data, error: readError } = await supabase
      .from("published_presences")
      .select("slug, core")
      .eq("billing_subscription_id", billingSubscriptionId);
    if (readError) storeFailure("billing-sync", readError.message);

    const { applyCatalogLimit } = await import("../entitlements");
    for (const row of (data ?? []) as { slug: string; core: KnowledgeCore }[]) {
      const visible = applyCatalogLimit(row.core, billing.plan).core;
      const files = generatedFiles(visible).map((f) => ({ path: f.path, type: f.type, content: f.content }));
      const { error } = await supabase
        .from("published_presences")
        .update({ ...patch, files })
        .eq("slug", row.slug);
      if (error) storeFailure("billing-sync", error.message);
    }
    return;
  }

  const { error } = await supabase
    .from("published_presences")
    .update(patch)
    .eq("billing_subscription_id", billingSubscriptionId);
  if (error) storeFailure("billing-sync", error.message);
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
    const { data, error: readError } = await supabase
      .from("mcp_rate_limits")
      .select("id, hits")
      .eq("bucket_key", bucketKey)
      .eq("window_start", iso)
      .maybeSingle();
    // Fail closed: a broken limiter must not become an open door.
    if (readError) {
      console.error("[crawler] rate limit read failed", readError.message);
      return false;
    }
    if (data) {
      const row = data as { id: string; hits: number };
      if (row.hits >= limit) return false;
      const { error } = await supabase
        .from("mcp_rate_limits")
        .update({ hits: row.hits + 1 })
        .eq("id", row.id);
      if (error) {
        console.error("[crawler] rate limit update failed", error.message);
        return false;
      }
      return true;
    }
    const { error } = await supabase
      .from("mcp_rate_limits")
      .insert({ bucket_key: bucketKey, window_start: iso, hits: 1 });
    if (error) {
      console.error("[crawler] rate limit insert failed", error.message);
      return false;
    }
    return true;
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

/* ------------------------------------------------------------------ */
/* Custom domain (Pro and Business)                                    */
/* ------------------------------------------------------------------ */

/** Lowercased hostname without protocol, port, path or a trailing dot. */
export function normalizeDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  if (value.startsWith("www.")) value = value.slice(4);
  if (value.length < 4 || value.length > 253) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value)) return null;
  if (value.endsWith(".lovable.app") || value === "crawler.today") return null;
  return value;
}

/** Attaches (or replaces) an unverified custom domain and returns its TXT token. */
export async function setCustomDomain(slug: string, domain: string): Promise<string> {
  const token = opaqueToken("crwdom", 16);
  const supabase = await client();
  if (supabase) {
    const { data, error } = await supabase
      .from("published_presences")
      .update({ custom_domain: domain, custom_domain_token: token, custom_domain_verified_at: null })
      .eq("slug", slug)
      .select("slug");
    if (error) storeFailure("custom-domain", error.message);
    if (!data || data.length !== 1) storeFailure("custom-domain", `unexpected affected rows: ${data?.length ?? 0}`);
    return token;
  }
  const local = memory.get(slug);
  if (!local) storeFailure("custom-domain", "unknown presence");
  memory.set(slug, { ...local, customDomain: domain, customDomainToken: token, customDomainVerifiedAt: null });
  return token;
}

export async function clearCustomDomain(slug: string): Promise<void> {
  const supabase = await client();
  if (supabase) {
    const { error } = await supabase
      .from("published_presences")
      .update({ custom_domain: null, custom_domain_token: null, custom_domain_verified_at: null })
      .eq("slug", slug);
    if (error) storeFailure("custom-domain", error.message);
    return;
  }
  const local = memory.get(slug);
  if (!local) storeFailure("custom-domain", "unknown presence");
  memory.set(slug, { ...local, customDomain: null, customDomainToken: null, customDomainVerifiedAt: null });
}

export async function markCustomDomainVerified(slug: string): Promise<string> {
  const now = new Date().toISOString();
  const supabase = await client();
  if (supabase) {
    const { error } = await supabase
      .from("published_presences")
      .update({ custom_domain_verified_at: now })
      .eq("slug", slug);
    if (error) storeFailure("custom-domain", error.message);
    return now;
  }
  const local = memory.get(slug);
  if (!local) storeFailure("custom-domain", "unknown presence");
  memory.set(slug, { ...local, customDomainVerifiedAt: now });
  return now;
}

/** Resolves a live presence from a verified custom domain (host header). */
export async function getLivePresenceByDomain(host: string): Promise<PublishedPresence | undefined> {
  const domain = normalizeDomain(host);
  if (!domain) return undefined;
  const supabase = await client();
  if (supabase) {
    const { data, error } = await supabase
      .from("published_presences")
      .select(COLUMNS)
      .eq("custom_domain", domain)
      .not("custom_domain_verified_at", "is", null)
      .eq("status", "live")
      .maybeSingle();
    if (error) storeFailure("read", error.message);
    return data ? fromRow(data as Row) : undefined;
  }
  for (const record of memory.values()) {
    if (record.customDomain === domain && record.customDomainVerifiedAt && record.status === "live") {
      const { manageSecretHash: _hash, ...rest } = record;
      return rest;
    }
  }
  return undefined;
}
