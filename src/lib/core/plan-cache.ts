/**
 * Crawler Core V2 — short-lived effective-plan cache.
 *
 * The room library only ever sees a pseudonymous `subject_hash`. A plan that is
 * proven by a *draft session* (sess_…) therefore has to travel to it somehow.
 * `resolveAccessContext()` writes the merged, effective plan here; the room
 * entitlement resolver reads it and takes the highest of both. It is a cache,
 * never a source of truth: entries expire, and a plan is only ever raised.
 */
import { highestPlan, planRankOf, type CustomerPlan } from "../entitlements/features";

const TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { plan: CustomerPlan; at: number }>();

/** Remembers the highest plan proven for this identity (never a downgrade). */
export function notePlanForSubject(subjectHash: string | null | undefined, plan: unknown): void {
  if (!subjectHash) return;
  const next = highestPlan(plan);
  if (next === "free") return;
  const current = cache.get(subjectHash);
  const merged = current && Date.now() - current.at < TTL_MS ? highestPlan(current.plan, next) : next;
  cache.set(subjectHash, { plan: merged, at: Date.now() });
}

/** Plan proven for this identity within the cache window, or "free". */
export function notedPlanForSubject(subjectHash: string | null | undefined): CustomerPlan {
  if (!subjectHash) return "free";
  const entry = cache.get(subjectHash);
  if (!entry) return "free";
  if (Date.now() - entry.at > TTL_MS) {
    cache.delete(subjectHash);
    return "free";
  }
  return entry.plan;
}

export const isHigher = (a: unknown, b: unknown): boolean => planRankOf(a) > planRankOf(b);
