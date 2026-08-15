/**
 * Resonance scoring.
 *
 * IMPORTANT: a cryptographic hash cannot express semantic closeness, so
 * similarity is computed on the normalised dimension vector. The optional
 * salted "resonance signature" is a display/dedupe artefact only and is never
 * used for matching.
 */
import {
  DIMENSION_KEYS,
  MATCH_WEIGHTS,
  type Dimensions,
  type DimensionKey,
} from "./config";

export interface ScorablePattern {
  dimensions: Dimensions;
  intent: string;
  languages: string[];
  broad_region: string | null;
  connection_modes: string[];
}

/** Dense vector in a fixed key order; missing values default to the neutral 0.5. */
export function toVector(dimensions: Dimensions): number[] {
  return DIMENSION_KEYS.map((key: DimensionKey) => {
    const value = dimensions[key];
    return typeof value === "number" && Number.isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : 0.5;
  });
}

/** 1 = identical direction, 0 = maximally different. Deterministic. */
export function dimensionSimilarity(a: Dimensions, b: Dimensions): number {
  const va = toVector(a);
  const vb = toVector(b);
  let sum = 0;
  for (let i = 0; i < va.length; i += 1) sum += Math.abs((va[i] ?? 0) - (vb[i] ?? 0));
  return 1 - sum / va.length;
}

export function intentSimilarity(a: ScorablePattern, b: ScorablePattern): number {
  const exact = a.intent === b.intent ? 1 : 0;
  const modesA = new Set(a.connection_modes);
  const shared = b.connection_modes.filter((mode) => modesA.has(mode)).length;
  const union = new Set([...a.connection_modes, ...b.connection_modes]).size || 1;
  const overlap = shared / union;
  return Math.min(1, exact * 0.6 + overlap * 0.4 + (exact ? 0 : overlap * 0.2));
}

export function languageSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0.5;
  const setA = new Set(a.map((l) => l.toLowerCase()));
  const shared = b.filter((l) => setA.has(l.toLowerCase())).length;
  return shared > 0 ? 1 : 0;
}

export function regionSimilarity(a: string | null, b: string | null): number {
  if (!a || !b) return 0.5; // region is voluntary — never a penalty
  return a.toUpperCase() === b.toUpperCase() ? 1 : 0.25;
}

export interface ScoreResult {
  /** 0–100 resonance value. */
  score: number;
  reasons: string[];
  parts: { dimensions: number; intent: number; language: number; region: number };
}

/** Weighted, deterministic resonance score plus non-sensitive reasons. */
export function scorePatterns(a: ScorablePattern, b: ScorablePattern): ScoreResult {
  const parts = {
    dimensions: dimensionSimilarity(a.dimensions, b.dimensions),
    intent: intentSimilarity(a, b),
    language: languageSimilarity(a.languages, b.languages),
    region: regionSimilarity(a.broad_region, b.broad_region),
  };

  const weighted =
    parts.dimensions * MATCH_WEIGHTS.dimensions +
    parts.intent * MATCH_WEIGHTS.intent +
    parts.language * MATCH_WEIGHTS.language +
    parts.region * MATCH_WEIGHTS.region;

  const reasons: string[] = [];
  if (parts.dimensions >= 0.75) reasons.push("Similar creative direction");
  if (parts.intent >= 0.6) reasons.push("Compatible collaboration goals");
  if (parts.language === 1) reasons.push("Shared language");
  if (parts.region === 1) reasons.push("Same broad region");
  if (!reasons.length) reasons.push("Complementary directions");

  return { score: Math.round(weighted * 100), reasons: reasons.slice(0, 3), parts };
}

/**
 * Salted, non-reversible signature of the pattern. Display/dedupe only —
 * never a similarity measure.
 */
export async function resonanceSignature(
  salt: string,
  pattern: ScorablePattern,
): Promise<string> {
  const { hmacSha256Hex } = await import("../crypto");
  const canonical = JSON.stringify({
    d: toVector(pattern.dimensions).map((v) => Math.round(v * 10)),
    i: pattern.intent,
    l: [...pattern.languages].sort(),
  });
  return (await hmacSha256Hex(salt, canonical)).slice(0, 24);
}
