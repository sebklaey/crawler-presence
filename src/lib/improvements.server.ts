/**
 * Improvement workflow — "one clear recommended action", never an automatic
 * rewrite. Crawler may detect an issue and propose a value; only the owner
 * (holder of the recovery code) can approve it, and only approval publishes a
 * new version.
 */
import { db } from "./mcp/db.server";
import { coreFactStats } from "./health";
import type { KnowledgeCore } from "./knowledge";

export type RecommendationState =
  | "detected"
  | "review"
  | "approved"
  | "rejected"
  | "postponed"
  | "publishing"
  | "published";

export type Recommendation = {
  id: string;
  kind: string;
  fieldPath: string;
  currentValue: string | null;
  proposedValue: string | null;
  issue: string;
  evidence: string | null;
  expectedBenefit: string | null;
  affectedFiles: string[];
  confidence: "low" | "medium" | "high";
  verificationStatus: string;
  state: RecommendationState;
  createdAt: string;
  publishedAt: string | null;
};

const COLUMNS =
  "id, kind, field_path, current_value, proposed_value, issue, evidence, expected_benefit, affected_files, confidence, verification_status, state, created_at, published_at";

function store() {
  const supabase = db();
  if (!supabase) throw new Error("The Crawler database is temporarily unavailable. Nothing was changed.");
  return supabase;
}

const fromRow = (r: Record<string, any>): Recommendation => ({
  id: r["id"],
  kind: r["kind"],
  fieldPath: r["field_path"],
  currentValue: r["current_value"] ?? null,
  proposedValue: r["proposed_value"] ?? null,
  issue: r["issue"],
  evidence: r["evidence"] ?? null,
  expectedBenefit: r["expected_benefit"] ?? null,
  affectedFiles: (r["affected_files"] as string[]) ?? [],
  confidence: (["low", "medium", "high"].includes(r["confidence"]) ? r["confidence"] : "medium") as Recommendation["confidence"],
  verificationStatus: r["verification_status"] ?? "unverified",
  state: r["state"],
  createdAt: r["created_at"],
  publishedAt: r["published_at"] ?? null,
});

export async function listRecommendations(slug: string, states: RecommendationState[] = ["detected", "review", "postponed"]) {
  const { data, error } = await store()
    .from("improvement_recommendations")
    .select(COLUMNS)
    .eq("presence_slug", slug)
    .in("state", states)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error("Could not load recommendations.");
  return ((data ?? []) as Record<string, any>[]).map(fromRow);
}

export async function countAccepted(slug: string): Promise<number> {
  const { count } = await store()
    .from("improvement_recommendations")
    .select("id", { count: "exact", head: true })
    .eq("presence_slug", slug)
    .eq("state", "published");
  return count ?? 0;
}

type NewRecommendation = {
  kind: string;
  fieldPath: string;
  currentValue?: string | null;
  proposedValue?: string | null;
  issue: string;
  evidence?: string | null;
  expectedBenefit: string;
  affectedFiles: string[];
  confidence?: "low" | "medium" | "high";
  dedupeKey: string;
  changeId?: string | null;
};

/** Upserts by dedupe key, so repeated detection never stacks duplicates. */
async function upsert(slug: string, rec: NewRecommendation): Promise<void> {
  await store()
    .from("improvement_recommendations")
    .upsert(
      {
        presence_slug: slug,
        change_id: rec.changeId ?? null,
        kind: rec.kind,
        field_path: rec.fieldPath,
        current_value: rec.currentValue ?? null,
        proposed_value: rec.proposedValue ?? null,
        issue: rec.issue,
        evidence: rec.evidence ?? null,
        expected_benefit: rec.expectedBenefit,
        affected_files: rec.affectedFiles,
        confidence: rec.confidence ?? "medium",
        dedupe_key: rec.dedupeKey,
      },
      { onConflict: "presence_slug,dedupe_key", ignoreDuplicates: true },
    );
}

/**
 * Derives recommendations from what Crawler can actually see in the approved
 * Knowledge Core and from detected source changes. Every item states the
 * issue, the evidence and why it matters — no invented "AI visibility" claims.
 */
export async function detectRecommendations(input: {
  slug: string;
  core: KnowledgeCore;
  openChanges: { id: string; summary: string; evidence: string | null; url: string | null }[];
  approvedSources: number;
}): Promise<void> {
  const { core, slug } = input;
  const stats = coreFactStats(core);

  if (core.summary.length <= 60) {
    await upsert(slug, {
      kind: "content",
      fieldPath: "summary",
      currentValue: core.summary || null,
      issue: "The summary is too short for an AI system to describe you accurately.",
      evidence: `Current summary is ${core.summary.length} characters; a usable answer needs roughly 60–400.`,
      expectedBenefit: "A model that reads llms.txt can state what you do in one correct sentence instead of guessing.",
      affectedFiles: ["llms.txt", "llms-full.txt", "about.md", "api/entity.json"],
      confidence: "high",
      dedupeKey: "summary_too_short",
    });
  }

  if (stats.verified < 3) {
    await upsert(slug, {
      kind: "verification",
      fieldPath: "facts",
      currentValue: `${stats.verified} verified of ${stats.total}`,
      issue: "Fewer than three facts are confirmed by you.",
      evidence: `${stats.claimed} fact(s) are still marked as unverified claims.`,
      expectedBenefit: "Verified facts are published as facts; unverified ones stay marked as claims, which reads as weaker.",
      affectedFiles: ["llms-full.txt", "api/entity.json"],
      confidence: "high",
      dedupeKey: "too_few_verified_facts",
    });
  }

  if (core.faqs.length < 3) {
    await upsert(slug, {
      kind: "content",
      fieldPath: "faqs",
      currentValue: `${core.faqs.length} answers`,
      issue: "Fewer than three answered questions.",
      evidence: core.gaps.length ? `Open gaps: ${core.gaps.slice(0, 3).join("; ")}` : "No FAQ entries recorded.",
      expectedBenefit: "Assistants answer questions; each answered question is one question they no longer have to invent.",
      affectedFiles: ["faq.md", "llms-full.txt"],
      confidence: "medium",
      dedupeKey: "too_few_faqs",
    });
  }

  if (input.approvedSources === 0) {
    await upsert(slug, {
      kind: "monitoring",
      fieldPath: "sources",
      issue: "No source URL is approved for monitoring.",
      evidence: "Crawler only reads sources you approved, so without one it cannot notice when your facts age.",
      expectedBenefit: "Crawler tells you when your own site changes and your published facts no longer match it.",
      affectedFiles: [],
      confidence: "high",
      dedupeKey: "no_sources",
    });
  }

  if (stats.updatedAge !== null && stats.updatedAge > 180) {
    await upsert(slug, {
      kind: "freshness",
      fieldPath: "core",
      currentValue: core.updatedAt,
      issue: "The Knowledge Core has not been reviewed in more than six months.",
      evidence: `Last update ${Math.round(stats.updatedAge)} days ago.`,
      expectedBenefit: "A dated Presence is worse than none: confirming or correcting it keeps published answers true.",
      affectedFiles: ["llms.txt", "llms-full.txt"],
      confidence: "medium",
      dedupeKey: "core_stale_180",
    });
  }

  for (const change of input.openChanges.slice(0, 3)) {
    await upsert(slug, {
      kind: "source_change",
      fieldPath: "core",
      issue: "A source you approved changed since the last scan.",
      evidence: `${change.url ?? "source"} — ${change.summary}${change.evidence ? `\n\n"${change.evidence.slice(0, 300)}…"` : ""}`,
      expectedBenefit: "Reviewing the change keeps your published facts consistent with your own site.",
      affectedFiles: ["llms.txt", "llms-full.txt", "api/entity.json"],
      confidence: "low",
      dedupeKey: `change_${change.id}`,
      changeId: change.id,
    });
  }
}

export async function setRecommendationState(
  slug: string,
  id: string,
  state: RecommendationState,
  rejectionReason?: string,
): Promise<void> {
  const { error } = await store()
    .from("improvement_recommendations")
    .update({
      state,
      decided_at: new Date().toISOString(),
      ...(state === "published" ? { published_at: new Date().toISOString() } : {}),
      ...(rejectionReason ? { rejection_reason: rejectionReason.slice(0, 500) } : {}),
    })
    .eq("presence_slug", slug)
    .eq("id", id);
  if (error) throw new Error("Could not update that recommendation.");
}

export async function getRecommendation(slug: string, id: string): Promise<Recommendation | null> {
  const { data } = await store()
    .from("improvement_recommendations")
    .select(COLUMNS)
    .eq("presence_slug", slug)
    .eq("id", id)
    .maybeSingle();
  return data ? fromRow(data as Record<string, any>) : null;
}

/**
 * Applies an approved textual recommendation to the Knowledge Core. Only
 * explicitly supported fields can be written, and only with a value the owner
 * saw and approved. Everything else stays a review task for a human.
 */
export function applyToCore(core: KnowledgeCore, rec: Recommendation, value: string): KnowledgeCore {
  const next: KnowledgeCore = { ...core, updatedAt: new Date().toISOString() };
  switch (rec.fieldPath) {
    case "summary":
      next.summary = value.slice(0, 2000);
      return next;
    case "tagline":
      next.tagline = value.slice(0, 300);
      return next;
    default:
      throw new Error("This recommendation has to be applied in the editor; Crawler will not rewrite it for you.");
  }
}
