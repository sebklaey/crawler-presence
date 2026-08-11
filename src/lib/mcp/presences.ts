/**
 * Published presences and simple rate limiting for the public MCP server.
 * Both live behind the RLS-locked service-role client in `db.server.ts`.
 */
import { generatedFiles, presenceSlug, type KnowledgeCore } from "../knowledge";
import { opaqueToken } from "./sessions";

export type PublishMode = "demo" | "live";

export type PublishedPresence = {
  slug: string;
  core: KnowledgeCore;
  files: { path: string; type: string; content: string }[];
  plan: string;
  mode: PublishMode;
  claimToken: string;
  publishedAt: string;
};

const memory = new Map<string, PublishedPresence>();

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

export async function publishDraft(input: {
  core: KnowledgeCore;
  plan: string;
  mode: PublishMode;
  sessionToken?: string;
  ownerUserId?: string;
}): Promise<PublishedPresence> {
  const files = generatedFiles(input.core).map((f) => ({ path: f.path, type: f.type, content: f.content }));
  const record: PublishedPresence = {
    slug: `${presenceSlug(input.core)}-${randomSuffix()}`,
    core: input.core,
    files,
    plan: input.plan,
    mode: input.mode,
    claimToken: opaqueToken("claim"),
    publishedAt: new Date().toISOString(),
  };

  const supabase = await client();
  if (supabase) {
    const { error } = await supabase.from("published_presences").insert({
      slug: record.slug,
      session_token: input.sessionToken ?? null,
      core: record.core,
      files: record.files,
      plan: record.plan,
      mode: record.mode,
      claim_token: record.claimToken,
      owner_user_id: input.ownerUserId ?? null,
    });
    if (!error) return record;
  }
  memory.set(record.slug, record);
  return record;
}

export async function getPublished(slug: string): Promise<PublishedPresence | undefined> {
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,120}$/.test(slug)) return undefined;
  const supabase = await client();
  if (supabase) {
    const { data } = await supabase
      .from("published_presences")
      .select("slug, core, files, plan, mode, claim_token, created_at")
      .eq("slug", slug)
      .maybeSingle();
    if (data) {
      const row = data as {
        slug: string;
        core: KnowledgeCore;
        files: PublishedPresence["files"];
        plan: string;
        mode: string;
        claim_token: string;
        created_at: string;
      };
      return {
        slug: row.slug,
        core: row.core,
        files: row.files ?? [],
        plan: row.plan,
        mode: row.mode === "live" ? "live" : "demo",
        claimToken: row.claim_token,
        publishedAt: row.created_at,
      };
    }
  }
  return memory.get(slug);
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
