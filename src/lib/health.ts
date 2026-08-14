/**
 * Baseline and explainable Presence health.
 *
 * Everything in here is derived from data Crawler itself can observe: the
 * owner-approved Knowledge Core, the reachability of the public endpoints,
 * source scans, open recommendations and the billing state. No external AI
 * system is queried, nothing is guessed, and a Presence is never marked
 * unhealthy just because no external assistant produced observable activity.
 */
import { presenceChecks, type KnowledgeCore } from "./knowledge";
import { completenessScore } from "./kc/model";

export type HealthReason = {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
};

export type HealthState =
  | "new"
  | "activating"
  | "healthy"
  | "needs_attention"
  | "at_risk"
  | "payment_risk"
  | "dormant";

export type PresenceBaseline = {
  capturedAt: string;
  completeness: number;
  verifiedFacts: number;
  claimedFacts: number;
  verifiedFactRatio: number;
  staleFacts: number;
  conflicts: number;
  unansweredFaqs: number;
  contentRecords: number;
  endpointsChecked: number;
  endpointsHealthy: number;
  /**
   * Synthetic AI accuracy is only ever a number when an evaluation provider is
   * configured; otherwise it stays null and the UI shows "Not configured".
   */
  syntheticAccuracy: number | null;
  syntheticEvaluatedAt: string | null;
};

/** A fact counts as stale when its own source has not been reconfirmed in a year. */
export const STALE_AFTER_DAYS = 365;

const daysSince = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 86_400_000;
};

export function coreFactStats(core: KnowledgeCore) {
  const verified = core.facts.filter((f) => f.status === "verified").length;
  const claimed = core.facts.length - verified;
  const updatedAge = daysSince(core.updatedAt);
  // Without per-fact timestamps the Core's own age is the honest signal.
  const stale = updatedAge !== null && updatedAge > STALE_AFTER_DAYS ? core.facts.length : 0;
  return { verified, claimed, stale, total: core.facts.length, updatedAge };
}

export function buildBaseline(input: {
  core: KnowledgeCore;
  conflicts: number;
  endpointsChecked: number;
  endpointsHealthy: number;
}): PresenceBaseline {
  const stats = coreFactStats(input.core);
  return {
    capturedAt: new Date().toISOString(),
    completeness: completenessScore(input.core),
    verifiedFacts: stats.verified,
    claimedFacts: stats.claimed,
    verifiedFactRatio: stats.total ? Math.round((stats.verified / stats.total) * 100) : 0,
    staleFacts: stats.stale,
    conflicts: input.conflicts,
    unansweredFaqs: input.core.gaps.length,
    contentRecords: input.core.items.length,
    endpointsChecked: input.endpointsChecked,
    endpointsHealthy: input.endpointsHealthy,
    syntheticAccuracy: null,
    syntheticEvaluatedAt: null,
  };
}

export type HealthInput = {
  core: KnowledgeCore;
  published: boolean;
  status: "live" | "offline";
  subscriptionStatus: string | null;
  mode: "demo" | "live";
  approvedSources: number;
  lastSourceScanAt: string | null;
  openConflicts: number;
  measuredEvents30d: number;
  acceptedImprovements: number;
  pendingRecommendations: number;
  endpointsHealthy: boolean;
};

export type HealthResult = { score: number; state: HealthState; reasons: HealthReason[] };

/**
 * 0–100, weighted and fully explainable: every point awarded or withheld comes
 * back as a reason string that can be shown to the owner verbatim.
 */
export function computeHealth(input: HealthInput): HealthResult {
  const reasons: HealthReason[] = [];
  const add = (key: string, label: string, points: number, max: number, detail: string) =>
    reasons.push({ key, label, points: Math.max(0, Math.min(points, max)), max, detail });

  // 1. Activation and successful publication — 30
  const completeness = completenessScore(input.core);
  const activation = input.published && input.status === "live" && input.endpointsHealthy ? 30 : input.published ? 15 : 0;
  add(
    "activation",
    "Published and reachable",
    activation,
    30,
    !input.published
      ? "Not published yet. Publishing is what makes the Presence readable by AI systems."
      : input.status !== "live"
        ? "The Presence is currently offline, so nothing can read it."
        : input.endpointsHealthy
          ? "The Presence is live and its public files answer."
          : "The Presence is live but at least one public file did not answer on the last check.",
  );

  // 2. Knowledge Core freshness and completeness — 20
  const stats = coreFactStats(input.core);
  const freshnessPoints =
    Math.round((completeness / 100) * 12) + (stats.updatedAge !== null && stats.updatedAge < 90 ? 8 : stats.stale ? 0 : 4);
  add(
    "freshness",
    "Knowledge Core freshness",
    freshnessPoints,
    20,
    `Completeness ${completeness}%, ${stats.verified} verified and ${stats.claimed} unverified facts, last updated ${
      stats.updatedAge === null ? "unknown" : `${Math.round(stats.updatedAge)} days ago`
    }.`,
  );

  // 3. Measurable monthly value — 20 (never punishes silence from external AI)
  const measured = input.measuredEvents30d;
  const valuePoints = measured >= 50 ? 20 : measured >= 10 ? 14 : measured > 0 ? 8 : 6;
  add(
    "measured_value",
    "Measured activity (last 30 days)",
    valuePoints,
    20,
    measured > 0
      ? `${measured} Crawler-observable events (public file reads, tool interactions, outbound clicks).`
      : "No Crawler-observable events yet. This is not a fault: activity outside Crawler cannot be measured and is never guessed.",
  );

  // 4. Connected, owner-approved sources — 10
  const scanAge = daysSince(input.lastSourceScanAt);
  const sourcePoints = input.approvedSources === 0 ? 0 : scanAge !== null && scanAge <= 30 ? 10 : 5;
  add(
    "sources",
    "Approved sources monitored",
    sourcePoints,
    10,
    input.approvedSources === 0
      ? "No source URL approved yet, so Crawler cannot notice when your facts go out of date."
      : `${input.approvedSources} approved source(s); last scan ${
          scanAge === null ? "never" : `${Math.round(scanAge)} days ago`
        }.`,
  );

  // 5. Improvement activity — 10
  const improvementPoints =
    input.acceptedImprovements > 0 ? 10 : input.pendingRecommendations > 0 ? 3 : 6;
  add(
    "improvements",
    "Improvement activity",
    improvementPoints,
    10,
    input.acceptedImprovements > 0
      ? `${input.acceptedImprovements} improvement(s) reviewed and published.`
      : input.pendingRecommendations > 0
        ? `${input.pendingRecommendations} recommendation(s) waiting for your review.`
        : "Nothing to improve right now.",
  );

  // 6. Billing health — 10
  const billingBad = ["past_due", "unpaid"].includes(input.subscriptionStatus ?? "");
  const canceled = input.subscriptionStatus === "canceled";
  const billingPoints = input.mode === "demo" ? 10 : billingBad ? 0 : canceled ? 4 : 10;
  add(
    "billing",
    "Billing state",
    billingPoints,
    10,
    input.mode === "demo"
      ? "Demo mode — no real subscription is involved."
      : billingBad
        ? "A payment did not go through. Update the payment method to keep management features unlocked."
        : canceled
          ? "The subscription is cancelled; the Presence stays online until the end of the paid period."
          : "Subscription in good standing.",
  );

  const score = reasons.reduce((sum, r) => sum + r.points, 0);

  let state: HealthState = "healthy";
  if (!input.published) state = "new";
  else if (billingBad) state = "payment_risk";
  else if (input.status !== "live" || !input.endpointsHealthy) state = "at_risk";
  else if (completeness < 60 || score < 55) state = "activating";
  else if (input.openConflicts > 0 || input.pendingRecommendations > 0 || score < 70) state = "needs_attention";
  else if (measured === 0 && (scanAge === null || scanAge > 60)) state = "dormant";

  return { score, state, reasons };
}

/** Checks the Presence has at least name + summary + one verified fact. */
export function qualifiesForPublish(core: KnowledgeCore): { ok: boolean; missing: string[] } {
  const missing = presenceChecks(core)
    .filter((c) => !c.done)
    .map((c) => c.label);
  const ok = Boolean(core.name) && core.summary.length > 60 && core.facts.some((f) => f.status === "verified");
  return { ok, missing };
}
