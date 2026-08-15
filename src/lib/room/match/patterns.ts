/**
 * Resonance patterns — storage and strict validation.
 *
 * PRIVACY: Crawler stores only abstract match dimensions. No profile texts, no
 * chat history, no sensitive categories. Every input is validated against a
 * closed vocabulary; free text is rejected.
 */
import { randomId } from "../crypto";
import { roomError } from "../errors";
import type { Db } from "../store";
import {
  CONNECTION_MODES,
  DEFAULT_EXPIRY_DAYS,
  DIMENSION_KEYS,
  INTENTS,
  MAX_EXPIRY_DAYS,
  type Dimensions,
  type DimensionKey,
} from "./config";
import { resonanceSignature, type ScorablePattern } from "./scoring";

export interface PatternRow {
  id: string;
  anonymous_pattern_id: string;
  subject_hash: string;
  schema_version: string;
  intent: string;
  dimensions: Dimensions;
  languages: string[];
  broad_region: string | null;
  connection_modes: string[];
  resonance_signature: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  deleted_at: string | null;
}

export interface PatternInput {
  intent: string;
  dimensions: Dimensions;
  languages: string[];
  broad_region: string | null;
  connection_modes: string[];
  expires_in_days: number;
}

const LANGUAGE_RE = /^[a-z]{2}$/;
const REGION_RE = /^[A-Za-z]{2}(-[A-Za-z0-9]{1,3})?$/;

/** Rejects anything that is not part of the closed abstract vocabulary. */
export function validatePatternInput(raw: unknown): PatternInput {
  const input = (raw ?? {}) as Record<string, unknown>;

  const intent = String(input["intent"] ?? "").trim();
  if (!(INTENTS as readonly string[]).includes(intent)) {
    throw roomError("INVALID_INPUT", `intent muss einer von: ${INTENTS.join(", ")}`);
  }

  const rawDimensions = (input["dimensions"] ?? {}) as Record<string, unknown>;
  if (typeof rawDimensions !== "object" || Array.isArray(rawDimensions)) {
    throw roomError("INVALID_INPUT", "dimensions muss ein Objekt mit Werten zwischen 0 und 1 sein.");
  }
  const dimensions: Dimensions = {};
  for (const [key, value] of Object.entries(rawDimensions)) {
    if (!(DIMENSION_KEYS as readonly string[]).includes(key)) {
      throw roomError("INVALID_INPUT", `Unbekannte Dimension "${key}".`);
    }
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
      throw roomError("INVALID_INPUT", `Dimension "${key}" muss zwischen 0 und 1 liegen.`);
    }
    dimensions[key as DimensionKey] = Math.round(numeric * 100) / 100;
  }
  if (Object.keys(dimensions).length < 4) {
    throw roomError("INVALID_INPUT", "Bitte mindestens vier Dimensionen angeben.");
  }

  const languages = Array.isArray(input["languages"])
    ? (input["languages"] as unknown[]).map((l) => String(l).trim().toLowerCase())
    : [];
  for (const language of languages) {
    if (!LANGUAGE_RE.test(language)) {
      throw roomError("INVALID_INPUT", "languages muss zweibuchstabige Sprachcodes enthalten (z. B. de, en).");
    }
  }
  if (!languages.length) throw roomError("INVALID_INPUT", "Bitte mindestens eine Sprache angeben.");

  const regionRaw = input["broad_region"];
  let broad_region: string | null = null;
  if (typeof regionRaw === "string" && regionRaw.trim()) {
    const region = regionRaw.trim();
    if (!REGION_RE.test(region)) {
      throw roomError("INVALID_INPUT", "broad_region muss ein grober Ländercode sein (z. B. CH, DE).");
    }
    broad_region = region.toUpperCase();
  }

  const modes = Array.isArray(input["connection_modes"])
    ? (input["connection_modes"] as unknown[]).map((m) => String(m).trim().toLowerCase())
    : [];
  for (const mode of modes) {
    if (!(CONNECTION_MODES as readonly string[]).includes(mode)) {
      throw roomError("INVALID_INPUT", `connection_modes darf nur enthalten: ${CONNECTION_MODES.join(", ")}`);
    }
  }
  if (!modes.length) throw roomError("INVALID_INPUT", "Bitte mindestens eine Verbindungsart angeben.");

  const days = Number(input["expires_in_days"] ?? DEFAULT_EXPIRY_DAYS);
  const expires_in_days =
    Number.isFinite(days) && days > 0 ? Math.min(MAX_EXPIRY_DAYS, Math.round(days)) : DEFAULT_EXPIRY_DAYS;

  return { intent, dimensions, languages, broad_region, connection_modes: modes, expires_in_days };
}

export function toScorable(row: PatternRow): ScorablePattern {
  return {
    dimensions: row.dimensions ?? {},
    intent: row.intent,
    languages: row.languages ?? [],
    broad_region: row.broad_region,
    connection_modes: row.connection_modes ?? [],
  };
}

export async function getActivePattern(db: Db, subjectHash: string): Promise<PatternRow | null> {
  const { data, error } = await db
    .from("resonance_patterns")
    .select("*")
    .eq("subject_hash", subjectHash)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw roomError("INTERNAL_ERROR");
  return (data as PatternRow | null) ?? null;
}

export async function getPatternByPublicId(db: Db, publicId: string): Promise<PatternRow | null> {
  const { data } = await db
    .from("resonance_patterns")
    .select("*")
    .eq("anonymous_pattern_id", publicId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as PatternRow | null) ?? null;
}

function expiryIso(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export async function createPattern(
  db: Db,
  subjectHash: string,
  input: PatternInput,
  signatureSalt: string,
): Promise<PatternRow> {
  const existing = await getActivePattern(db, subjectHash);
  if (existing) {
    throw roomError("DUPLICATE_REQUEST", "Du hast bereits ein Schwingungsmuster. Nutze update_resonance_pattern.");
  }

  const signature = await resonanceSignature(signatureSalt, {
    dimensions: input.dimensions,
    intent: input.intent,
    languages: input.languages,
    broad_region: input.broad_region,
    connection_modes: input.connection_modes,
  });

  const { data, error } = await db
    .from("resonance_patterns")
    .insert({
      anonymous_pattern_id: `rp_${randomId(10)}`,
      subject_hash: subjectHash,
      intent: input.intent,
      dimensions: input.dimensions,
      languages: input.languages,
      broad_region: input.broad_region,
      connection_modes: input.connection_modes,
      resonance_signature: signature,
      status: "searching",
      expires_at: expiryIso(input.expires_in_days),
    })
    .select("*")
    .single();
  if (error || !data) throw roomError("INTERNAL_ERROR");
  return data as PatternRow;
}

export async function updatePattern(
  db: Db,
  subjectHash: string,
  input: PatternInput,
  signatureSalt: string,
): Promise<PatternRow> {
  const existing = await getActivePattern(db, subjectHash);
  if (!existing) throw roomError("NOT_FOUND", "Du hast noch kein Schwingungsmuster.");

  const signature = await resonanceSignature(signatureSalt, {
    dimensions: input.dimensions,
    intent: input.intent,
    languages: input.languages,
    broad_region: input.broad_region,
    connection_modes: input.connection_modes,
  });

  const { data, error } = await db
    .from("resonance_patterns")
    .update({
      intent: input.intent,
      dimensions: input.dimensions,
      languages: input.languages,
      broad_region: input.broad_region,
      connection_modes: input.connection_modes,
      resonance_signature: signature,
      expires_at: expiryIso(input.expires_in_days),
    })
    .eq("id", existing.id)
    .select("*")
    .single();
  if (error || !data) throw roomError("INTERNAL_ERROR");
  return data as PatternRow;
}

/** Irreversible: the pattern and all its open proposals disappear. */
export async function deletePattern(db: Db, subjectHash: string): Promise<boolean> {
  const existing = await getActivePattern(db, subjectHash);
  if (!existing) return false;
  await db
    .from("match_requests")
    .delete()
    .or(`requester_pattern_id.eq.${existing.id},candidate_pattern_id.eq.${existing.id}`)
    .in("state", ["candidate_found", "awaiting_response"]);
  const { error } = await db.from("resonance_patterns").delete().eq("id", existing.id);
  if (error) throw roomError("INTERNAL_ERROR");
  return true;
}

export async function setPatternStatus(db: Db, patternId: string, status: string) {
  await db.from("resonance_patterns").update({ status }).eq("id", patternId);
}

/** Public, non-identifying view of a pattern. */
export function publicPattern(row: PatternRow) {
  return {
    anonymous_pattern_id: row.anonymous_pattern_id,
    intent: row.intent,
    dimensions: row.dimensions,
    languages: row.languages,
    broad_region: row.broad_region,
    connection_modes: row.connection_modes,
    resonance_signature: row.resonance_signature,
    status: row.status,
    expires_at: row.expires_at,
  };
}
