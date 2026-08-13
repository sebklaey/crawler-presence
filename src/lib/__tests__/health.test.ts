import { describe, expect, it } from "bun:test";

import {
  buildBaseline,
  computeHealth,
  coreFactStats,
  qualifiesForPublish,
  STALE_AFTER_DAYS,
  type HealthInput,
} from "../health";
import { emptyCore } from "../knowledge";
import { completeCore, fact } from "./fixtures";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const healthy = (overrides: Partial<HealthInput> = {}): HealthInput => ({
  core: completeCore({ updatedAt: daysAgo(3) }),
  published: true,
  status: "live",
  subscriptionStatus: "active",
  mode: "live",
  approvedSources: 2,
  lastSourceScanAt: daysAgo(5),
  openConflicts: 0,
  measuredEvents30d: 120,
  acceptedImprovements: 2,
  pendingRecommendations: 0,
  endpointsHealthy: true,
  ...overrides,
});

const reason = (input: HealthInput, key: string) =>
  computeHealth(input).reasons.find((r) => r.key === key)!;

describe("coreFactStats", () => {
  it("splits verified from claimed facts and computes the core age", () => {
    const stats = coreFactStats(
      completeCore({ facts: [fact("A", "1"), fact("B", "2", "claimed")], updatedAt: daysAgo(10) }),
    );
    expect(stats).toMatchObject({ verified: 1, claimed: 1, total: 2, stale: 0 });
    expect(stats.updatedAge).toBeCloseTo(10, 1);
  });

  it("marks all facts stale once the core is older than the stale window", () => {
    const stats = coreFactStats(completeCore({ updatedAt: daysAgo(STALE_AFTER_DAYS + 1) }));
    expect(stats.stale).toBe(3);
  });

  it("reports an unknown age for an unparseable timestamp", () => {
    expect(coreFactStats(completeCore({ updatedAt: "not-a-date" })).updatedAge).toBeNull();
    expect(coreFactStats(completeCore({ updatedAt: "" })).updatedAge).toBeNull();
  });
});

describe("buildBaseline", () => {
  it("captures completeness, fact ratio and endpoint counts", () => {
    const baseline = buildBaseline({
      core: completeCore({
        facts: [fact("A", "1"), fact("B", "2"), fact("C", "3"), fact("D", "4", "claimed")],
      }),
      conflicts: 1,
      endpointsChecked: 4,
      endpointsHealthy: 3,
    });
    expect(baseline.completeness).toBe(100);
    expect(baseline.verifiedFacts).toBe(3);
    expect(baseline.claimedFacts).toBe(1);
    expect(baseline.verifiedFactRatio).toBe(75);
    expect(baseline.conflicts).toBe(1);
    expect(baseline.endpointsChecked).toBe(4);
    expect(baseline.endpointsHealthy).toBe(3);
    expect(baseline.syntheticAccuracy).toBeNull();
    expect(Number.isNaN(Date.parse(baseline.capturedAt))).toBe(false);
  });

  it("reports a 0% ratio instead of NaN when there are no facts", () => {
    const baseline = buildBaseline({
      core: emptyCore(),
      conflicts: 0,
      endpointsChecked: 0,
      endpointsHealthy: 0,
    });
    expect(baseline.verifiedFactRatio).toBe(0);
    expect(baseline.contentRecords).toBe(0);
  });
});

describe("computeHealth scoring", () => {
  it("gives a fully healthy presence the maximum score", () => {
    const result = computeHealth(healthy());
    expect(result.score).toBe(100);
    expect(result.state).toBe("healthy");
    expect(result.reasons.map((r) => r.key)).toEqual([
      "activation",
      "freshness",
      "measured_value",
      "sources",
      "improvements",
      "billing",
    ]);
    expect(result.reasons.every((r) => r.detail.length > 0 && r.points <= r.max)).toBe(true);
  });

  it("halves activation while published but offline, and zeroes it before publishing", () => {
    expect(reason(healthy({ status: "offline" }), "activation").points).toBe(15);
    expect(reason(healthy({ published: false }), "activation").points).toBe(0);
    expect(reason(healthy({ endpointsHealthy: false }), "activation").detail).toContain(
      "did not answer",
    );
  });

  it("grades measured activity in bands without punishing silence", () => {
    expect(reason(healthy({ measuredEvents30d: 50 }), "measured_value").points).toBe(20);
    expect(reason(healthy({ measuredEvents30d: 10 }), "measured_value").points).toBe(14);
    expect(reason(healthy({ measuredEvents30d: 1 }), "measured_value").points).toBe(8);
    const silent = reason(healthy({ measuredEvents30d: 0 }), "measured_value");
    expect(silent.points).toBe(6);
    expect(silent.detail).toContain("not a fault");
  });

  it("rewards recently scanned approved sources only", () => {
    expect(reason(healthy(), "sources").points).toBe(10);
    expect(reason(healthy({ lastSourceScanAt: daysAgo(45) }), "sources").points).toBe(5);
    expect(reason(healthy({ lastSourceScanAt: null }), "sources").points).toBe(5);
    expect(reason(healthy({ approvedSources: 0 }), "sources").points).toBe(0);
  });

  it("scores improvement activity over pending recommendations", () => {
    expect(reason(healthy(), "improvements").points).toBe(10);
    expect(
      reason(healthy({ acceptedImprovements: 0, pendingRecommendations: 2 }), "improvements")
        .points,
    ).toBe(3);
    expect(
      reason(healthy({ acceptedImprovements: 0, pendingRecommendations: 0 }), "improvements")
        .points,
    ).toBe(6);
  });

  it("penalises failed payments, softens cancellation and ignores demo mode", () => {
    expect(reason(healthy({ subscriptionStatus: "past_due" }), "billing").points).toBe(0);
    expect(reason(healthy({ subscriptionStatus: "unpaid" }), "billing").points).toBe(0);
    expect(reason(healthy({ subscriptionStatus: "canceled" }), "billing").points).toBe(4);
    expect(
      reason(healthy({ subscriptionStatus: "past_due", mode: "demo" }), "billing").points,
    ).toBe(10);
  });

  it("loses freshness points for a stale core", () => {
    const stale = reason(
      healthy({ core: completeCore({ updatedAt: daysAgo(STALE_AFTER_DAYS + 10) }) }),
      "freshness",
    );
    expect(stale.points).toBe(12);
    const middleAged = reason(
      healthy({ core: completeCore({ updatedAt: daysAgo(120) }) }),
      "freshness",
    );
    expect(middleAged.points).toBe(16);
    expect(
      reason(healthy({ core: completeCore({ updatedAt: "not-a-date" }) }), "freshness").detail,
    ).toContain("unknown");
  });
});

describe("computeHealth state", () => {
  it("is new before publication, whatever the rest looks like", () => {
    expect(computeHealth(healthy({ published: false })).state).toBe("new");
  });

  it("prioritises payment risk over everything else once published", () => {
    expect(
      computeHealth(healthy({ subscriptionStatus: "past_due", status: "offline" })).state,
    ).toBe("payment_risk");
  });

  it("is at risk while offline or with failing endpoints", () => {
    expect(computeHealth(healthy({ status: "offline" })).state).toBe("at_risk");
    expect(computeHealth(healthy({ endpointsHealthy: false })).state).toBe("at_risk");
  });

  it("is activating while the core is incomplete", () => {
    expect(computeHealth(healthy({ core: emptyCore() })).state).toBe("activating");
  });

  it("needs attention with open conflicts or pending recommendations", () => {
    expect(computeHealth(healthy({ openConflicts: 1 })).state).toBe("needs_attention");
    expect(
      computeHealth(healthy({ acceptedImprovements: 0, pendingRecommendations: 1 })).state,
    ).toBe("needs_attention");
  });

  it("is dormant without measured events and without a recent scan", () => {
    expect(computeHealth(healthy({ measuredEvents30d: 0, lastSourceScanAt: null })).state).toBe(
      "dormant",
    );
    expect(
      computeHealth(healthy({ measuredEvents30d: 0, lastSourceScanAt: daysAgo(90) })).state,
    ).toBe("dormant");
    expect(
      computeHealth(healthy({ measuredEvents30d: 0, lastSourceScanAt: daysAgo(5) })).state,
    ).toBe("healthy");
  });
});

describe("qualifiesForPublish", () => {
  it("accepts a core with name, long summary and a verified fact", () => {
    expect(qualifiesForPublish(completeCore())).toEqual({ ok: true, missing: [] });
  });

  it("rejects an empty core and lists every failed check", () => {
    const result = qualifiesForPublish(emptyCore());
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(7);
  });

  it("rejects a core whose facts are all unverified", () => {
    const result = qualifiesForPublish(
      completeCore({ facts: [fact("Reach", "Global", "claimed")] }),
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["At least 3 verified facts"]);
  });

  it("rejects a too short summary", () => {
    expect(qualifiesForPublish(completeCore({ summary: "Short." })).ok).toBe(false);
  });
});
