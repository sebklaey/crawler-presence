/**
 * The Love feature vector and the mutual compatibility model.
 *
 * A cryptographic hash cannot express similarity, so Crawler stores a
 * structured feature vector (encrypted at rest) and compares it server-side
 * only. The vector never leaves the server: not in a public profile, not in
 * MCP structuredContent, not in a room, never to another user.
 */
import { LOVE_VECTOR_VERSION, LOVE_WEIGHTS } from "./config";
import {
  LOVE_QUESTIONS,
  parseLanguageRegion,
  type LoveAnswers,
} from "./interview";

export interface LoveVector {
  version: number;
  relationship_intention: string | null;
  values: string[];
  communication: string | null;
  closeness: string | null;
  conflict: string | null;
  expression: string | null;
  rhythm: string | null;
  social_energy: string | null;
  interests: string[];
  partner_preferences: string[];
  boundaries: string[];
  languages: string[];
  broad_region: string | null;
}

const first = (answers: LoveAnswers, id: string): string | null => {
  const entry = answers[id];
  if (!entry || entry.skipped || !entry.value.length) return null;
  return entry.value[0] ?? null;
};

const list = (answers: LoveAnswers, id: string): string[] => {
  const entry = answers[id];
  if (!entry || entry.skipped) return [];
  return entry.value.map((v) => v.trim()).filter(Boolean);
};

export function buildLoveVector(answers: LoveAnswers): LoveVector {
  const { languages, region } = parseLanguageRegion(list(answers, "language_region"));
  return {
    version: LOVE_VECTOR_VERSION,
    relationship_intention: first(answers, "relationship_intention"),
    values: list(answers, "values"),
    communication: first(answers, "communication_style"),
    closeness: first(answers, "closeness_independence"),
    conflict: first(answers, "conflict_repair"),
    expression: first(answers, "emotional_expression"),
    rhythm: first(answers, "daily_rhythm"),
    social_energy: first(answers, "social_energy"),
    interests: list(answers, "interests"),
    partner_preferences: list(answers, "partner_preferences"),
    boundaries: list(answers, "boundaries"),
    languages,
    broad_region: region,
  };
}

/* ------------------------------- similarity ------------------------------- */

const norm = (value: string) => value.trim().toLowerCase();

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0.5; // unknown, never punished as a mismatch
  const left = new Set(a.map(norm));
  const right = new Set(b.map(norm));
  let shared = 0;
  for (const item of left) if (right.has(item)) shared += 1;
  const union = new Set([...left, ...right]).size;
  return union ? shared / union : 0.5;
}

function categorical(a: string | null, b: string | null): number {
  if (!a || !b) return 0.5;
  return norm(a) === norm(b) ? 1 : 0.35;
}

/** Intentions that simply do not fit together. */
const INCOMPATIBLE_INTENTIONS: Array<[string, string]> = [
  ["long-term committed relationship", "romantic connection without immediate expectations"],
];

export function intentionsCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  const x = norm(a);
  const y = norm(b);
  return !INCOMPATIBLE_INTENTIONS.some(
    ([one, two]) => (x.includes(one) && y.includes(two)) || (x.includes(two) && y.includes(one)),
  );
}

/** How well B's qualities answer A's stated partner wishes. */
function preferenceFit(a: LoveVector, b: LoveVector): number {
  if (!a.partner_preferences.length) return 0.6;
  const bTraits = new Set(
    [...b.values, ...b.partner_preferences, b.communication ?? "", b.expression ?? ""]
      .filter(Boolean)
      .map(norm),
  );
  let hits = 0;
  for (const wish of a.partner_preferences) {
    const w = norm(wish);
    for (const trait of bTraits) {
      if (trait === w || trait.includes(w) || w.includes(trait)) {
        hits += 1;
        break;
      }
    }
  }
  return Math.min(1, 0.35 + hits / a.partner_preferences.length);
}

/** Hard requirements: language overlap and — when both stated one — region. */
export function hardRequirementsMet(a: LoveVector, b: LoveVector): boolean {
  if (a.languages.length && b.languages.length) {
    const shared = a.languages.some((lang) => b.languages.includes(lang));
    if (!shared) return false;
  }
  const noLongDistance = (v: LoveVector) =>
    v.boundaries.some((entry) => norm(entry).includes("long distance"));
  if ((noLongDistance(a) || noLongDistance(b)) && a.broad_region && b.broad_region) {
    if (a.broad_region !== b.broad_region) return false;
  }
  return true;
}

export interface LoveScore {
  /** Internal only — never shown to a user. */
  requesterScore: number;
  candidateScore: number;
  mutualScore: number;
  reasons: string[];
}

function directional(a: LoveVector, b: LoveVector): { score: number; parts: Record<string, number> } {
  const parts = {
    partner_preference_fit: preferenceFit(a, b),
    values: jaccard(a.values, b.values),
    communication: categorical(a.communication, b.communication),
    closeness: categorical(a.closeness, b.closeness),
    conflict: categorical(a.conflict, b.conflict),
    rhythm: (categorical(a.rhythm, b.rhythm) + categorical(a.social_energy, b.social_energy)) / 2,
    interests: jaccard(a.interests, b.interests),
  };
  let score = 0;
  for (const [key, weight] of Object.entries(LOVE_WEIGHTS)) {
    score += weight * (parts[key as keyof typeof parts] ?? 0.5);
  }
  return { score: Math.round(score * 100), parts };
}

/** Safe, general reasons — never raw interview answers. */
function safeReasons(a: LoveVector, b: LoveVector, parts: Record<string, number>): string[] {
  const reasons: string[] = [];
  if (a.relationship_intention && b.relationship_intention && intentionsCompatible(a.relationship_intention, b.relationship_intention)) {
    reasons.push("Compatible relationship intentions");
  }
  const sharedValues = a.values.filter((v) => b.values.map(norm).includes(norm(v)));
  if (sharedValues.length) reasons.push(`Shared values: ${sharedValues.slice(0, 3).join(", ")}`);
  if ((parts["communication"] ?? 0) >= 0.9) reasons.push("Similar communication preferences");
  if ((parts["closeness"] ?? 0) >= 0.9) reasons.push("Similar balance of closeness and independence");
  if ((parts["conflict"] ?? 0) >= 0.9) reasons.push("Similar way of repairing after a disagreement");
  const sharedInterests = a.interests.filter((v) => b.interests.map(norm).includes(norm(v)));
  if (sharedInterests.length) reasons.push(`Shared interests: ${sharedInterests.slice(0, 3).join(", ")}`);
  if (!reasons.length) reasons.push("Potential romantic compatibility in everyday rhythm");
  return reasons.slice(0, 5);
}

/**
 * Mutual compatibility: A must fit B's preferences AND B must fit A's.
 * The mutual score is the weaker of the two directions, never an average.
 */
export function scoreLoveVectors(a: LoveVector, b: LoveVector): LoveScore | null {
  if (!intentionsCompatible(a.relationship_intention, b.relationship_intention)) return null;
  if (!hardRequirementsMet(a, b)) return null;

  const forward = directional(a, b);
  const backward = directional(b, a);
  return {
    requesterScore: forward.score,
    candidateScore: backward.score,
    mutualScore: Math.min(forward.score, backward.score),
    reasons: safeReasons(a, b, forward.parts),
  };
}

/* -------------------------- human readable summary ------------------------- */

const AREA_LABEL: Record<string, string> = Object.fromEntries(
  LOVE_QUESTIONS.map((q) => [q.id, q.area]),
);

export function humanReadableSummary(vector: LoveVector): string {
  const lines = ["Your Crawler Love Profile", ""];
  const add = (label: string, value: string | null | string[]) => {
    const text = Array.isArray(value) ? value.join(", ") : value;
    if (!text) return;
    lines.push(`${label}:`, text, "");
  };
  add("Relationship intention", vector.relationship_intention);
  add("Core values", vector.values);
  add(
    "Connection style",
    [vector.communication, vector.closeness, vector.expression].filter(Boolean).join(" · ") || null,
  );
  add(
    "Everyday resonance",
    [vector.rhythm, vector.social_energy, ...vector.interests.slice(0, 3)].filter(Boolean).join(" · ") ||
      null,
  );
  add("Looking for", vector.partner_preferences);
  add("Boundaries", vector.boundaries);
  add(
    "Language and broad region",
    [vector.languages.join(", "), vector.broad_region].filter(Boolean).join(" · ") || null,
  );
  void AREA_LABEL;
  return lines.join("\n").trim();
}
