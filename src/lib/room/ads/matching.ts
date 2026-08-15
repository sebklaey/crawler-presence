/**
 * Crawler Ads — server-side resonance matching and delivery.
 *
 * Hard rules encoded here:
 *  - only voluntarily created user resonance patterns are ever compared;
 *  - a person without a pattern is never profiled and never sees a resonance ad;
 *  - resonance ads require an explicit, separately stored opt-in;
 *  - the advertiser never learns who saw anything (only an unlinkable
 *    frequency key is stored);
 *  - a sponsored placement is never a room message; it has its own placement id.
 */
import { encodeCampaignId, encodeCreativeId } from "../ids";
import { dimensionSimilarity } from "../match/scoring";
import { getActivePattern } from "../match/patterns";
import type { Db } from "../store";
import {
  AD_DELIVERY,
  AD_DISCLOSURE_LABEL,
  AD_MATCHING_NOTE,
  AD_REASON_CATEGORIES,
  AD_TRANSPARENCY_FACTS,
  AD_TRANSPARENCY_TEXT,
  DELIVERABLE_CAMPAIGN_STATUSES,
  DELIVERABLE_CREATIVE_STATUSES,
  AD_MATCH_WEIGHTS,
  MINIMUM_RESONANCE_SCORE,
} from "./config";
import { CREATIVE_COLUMNS, type CreativeRow } from "./creatives";

export interface SponsoredPlacement {
  placement_id: string;
  type: "sponsored_placement";
  creative_id: string;
  campaign_id: string;
  label: string;
  advertiser: string;
  advertiser_verified: boolean;
  product_name: string;
  headline: string;
  body: string;
  image_alt: string | null;
  image_reference: string | null;
  call_to_action: string;
  destination_url: string;
  destination_domain: string;
  knowledge_url: string | null;
  disclosure: string;
  matching_note: string;
  why_am_i_seeing_this: {
    explanation: string;
    categories: string[];
    facts: string[];
  };
  controls: string[];
  text_fallback: string;
}

/* ------------------------------- preferences ------------------------------- */

/** Unlinkable, advertiser-invisible frequency key. */
async function frequencyKey(subjectHash: string): Promise<string> {
  const { hmacSha256Hex } = await import("../crypto");
  const { requireSecret } = await import("../config");
  return (await hmacSha256Hex(requireSecret("MESSAGE_ID_SECRET"), `adfreq:${subjectHash}`)).slice(0, 32);
}

export async function resonanceAdsEnabled(db: Db, subjectHash: string): Promise<boolean> {
  const reference = await frequencyKey(subjectHash);
  const { data } = await db
    .from("resonance_ad_preferences")
    .select("enabled")
    .eq("internal_session_reference", reference)
    .maybeSingle();
  return Boolean((data as { enabled?: boolean } | null)?.enabled);
}

export async function setResonanceAdsPreference(db: Db, subjectHash: string, enabled: boolean) {
  const reference = await frequencyKey(subjectHash);
  const now = new Date().toISOString();
  await db.from("resonance_ad_preferences").upsert(
    {
      internal_session_reference: reference,
      enabled,
      consented_at: enabled ? now : null,
      updated_at: now,
    },
    { onConflict: "internal_session_reference" },
  );
  return {
    enabled,
    message: enabled
      ? "Resonance Ads sind aktiviert. Dein bestehendes Resonanzmuster wird ausschliesslich serverseitig verglichen; Werbekunden sehen es nie."
      : "Resonance Ads sind deaktiviert. Dein Resonanzmuster bleibt erhalten und Crawler Match funktioniert weiter.",
    note: "Diese Einstellung ist unabhängig vom Match-Opt-in.",
  };
}

export async function blockAdvertiser(db: Db, subjectHash: string, organizationId: string) {
  await db
    .from("blocked_advertisers")
    .upsert({ subject_hash: subjectHash, organization_id: organizationId }, { onConflict: "subject_hash,organization_id" });
  return { blocked: true, message: "Dieser Werbekunde wird dir nicht mehr angezeigt." };
}

/* --------------------------------- scoring -------------------------------- */

export interface AdScore {
  score: number;
  categories: string[];
}

export function scoreAdAgainstUser(input: {
  adDimensions: Record<string, number>;
  adIntents: string[];
  adLanguages: string[];
  userDimensions: Record<string, number>;
  userIntent: string;
  userModes: string[];
  userLanguages: string[];
  freshnessDays: number;
  recentImpressions: number;
}): AdScore {
  const dimensions = dimensionSimilarity(input.adDimensions, input.userDimensions);

  const intentSet = new Set(input.adIntents);
  const modeOverlap = input.userModes.some((mode) => input.adIntents.some((i) => i.includes(mode.split(" ")[0] ?? "")));
  const intent = intentSet.has(input.userIntent) ? 1 : modeOverlap ? 0.6 : 0.2;

  const userLangs = new Set(input.userLanguages.map((l) => l.toLowerCase()));
  const language = input.adLanguages.some((l) => userLangs.has(l.toLowerCase())) ? 1 : 0;

  const freshness = Math.max(0, 1 - input.freshnessDays / 60);
  const penalty = Math.min(1, input.recentImpressions * 0.35);
  const quality = Math.max(0, freshness * 0.7 + 0.3 - penalty);

  const score =
    dimensions * AD_MATCH_WEIGHTS.dimensions +
    intent * AD_MATCH_WEIGHTS.intent +
    language * AD_MATCH_WEIGHTS.language +
    quality * AD_MATCH_WEIGHTS.quality;

  const categories: string[] = [];
  if ((input.adDimensions["creative"] ?? 0) > 0.5) categories.push(AD_REASON_CATEGORIES[0]);
  if ((input.adDimensions["technical"] ?? 0) > 0.5) categories.push(AD_REASON_CATEGORIES[1]);
  if ((input.adDimensions["collaboration_intensity"] ?? 0) > 0.5) categories.push(AD_REASON_CATEGORIES[2]);
  if (language === 1) categories.push(AD_REASON_CATEGORIES[4]);
  if (!categories.length) categories.push(AD_REASON_CATEGORIES[3]);

  return { score: Math.round(score * 1000) / 1000, categories: [...new Set(categories)].slice(0, 3) };
}

/* -------------------------------- delivery -------------------------------- */

function resonanceBucket(score: number): string {
  if (score >= 0.9) return "0.90-1.00";
  if (score >= 0.82) return "0.82-0.89";
  if (score >= 0.77) return "0.77-0.81";
  return "0.72-0.76";
}

function buildTextFallback(card: Omit<SponsoredPlacement, "text_fallback">): string {
  return [
    `**${AD_DISCLOSURE_LABEL}**`,
    "",
    card.product_name,
    "",
    card.body,
    "",
    `[${card.call_to_action}](${card.destination_url})`,
    "",
    "Matched through privacy-preserving resonance. The advertiser cannot see your profile.",
  ].join("\n");
}

export interface SelectionContext {
  organicItemCount: number;
  language?: string | null;
  origin?: string;
}

/**
 * Returns at most one sponsored placement for this person, or an empty list.
 * Empty is a perfectly normal outcome — no ad is shown when nothing resonates.
 */
export async function selectResonancePlacements(
  db: Db,
  subjectHash: string,
  context: SelectionContext,
): Promise<SponsoredPlacement[]> {
  // 1. Feed must carry enough organic content.
  if (context.organicItemCount < AD_DELIVERY.minOrganicItemsBeforeAd) return [];
  if (context.organicItemCount < AD_DELIVERY.minRoomOrganicItems) return [];

  // 2. Explicit opt-in required.
  if (!(await resonanceAdsEnabled(db, subjectHash))) return [];

  // 3. Only voluntarily created user patterns are used. No pattern → no ad,
  //    and absolutely no covert profiling.
  const userPattern = await getActivePattern(db, subjectHash);
  if (!userPattern) return [];

  const key = await frequencyKey(subjectHash);
  const now = Date.now();
  const { data: recent } = await db
    .from("sponsored_impressions")
    .select("creative_id, displayed_at")
    .eq("anonymous_frequency_key", key)
    .gte("displayed_at", new Date(now - 7 * 24 * 3600 * 1000).toISOString());

  const history = (recent ?? []) as Array<{ creative_id: string; displayed_at: string }>;
  const today = history.filter((row) => now - new Date(row.displayed_at).getTime() < 24 * 3600 * 1000);
  if (today.length >= AD_DELIVERY.maxAdsPerDay) return [];
  if (history.length >= AD_DELIVERY.maxAdsPerWeek) return [];

  const cooldown = new Set(
    history
      .filter((row) => now - new Date(row.displayed_at).getTime() < AD_DELIVERY.sameCreativeCooldownHours * 3600 * 1000)
      .map((row) => row.creative_id),
  );
  const recentCounts = new Map<string, number>();
  for (const row of history) recentCounts.set(row.creative_id, (recentCounts.get(row.creative_id) ?? 0) + 1);

  // 4. Only approved, live campaigns with approved creatives.
  const nowIso = new Date().toISOString();
  const { data: campaigns } = await db
    .from("sponsored_campaigns")
    .select("id, status, safety_status, organization_id, starts_at, ends_at, organizations(name, verified)")
    .in("status", DELIVERABLE_CAMPAIGN_STATUSES)
    .limit(50);

  const liveCampaigns = ((campaigns ?? []) as any[]).filter((c) => {
    if (c.safety_status === "fail") return false;
    if (c.starts_at && c.starts_at > nowIso) return false;
    if (c.ends_at && c.ends_at < nowIso) return false;
    return true;
  });
  if (!liveCampaigns.length) return [];

  const [{ data: hidden }, { data: blocked }] = await Promise.all([
    db.from("user_hidden_campaigns").select("campaign_id").eq("subject_hash", subjectHash),
    db.from("blocked_advertisers").select("organization_id").eq("subject_hash", subjectHash),
  ]);
  const hiddenSet = new Set(((hidden ?? []) as any[]).map((r) => r.campaign_id));
  const blockedOrgs = new Set(((blocked ?? []) as any[]).map((r) => r.organization_id));

  const eligibleCampaigns = liveCampaigns.filter(
    (c) => !hiddenSet.has(c.id) && !blockedOrgs.has(c.organization_id),
  );
  if (!eligibleCampaigns.length) return [];

  const { data: creativeRows } = await db
    .from("ad_creatives")
    .select(CREATIVE_COLUMNS)
    .in(
      "campaign_id",
      eligibleCampaigns.map((c) => c.id),
    )
    .in("status", DELIVERABLE_CREATIVE_STATUSES)
    .limit(100);

  const creatives = ((creativeRows ?? []) as unknown as CreativeRow[]).filter((creative) => {
    // Content changed after approval → never delivered.
    if (!creative.approved_content_hash || creative.approved_content_hash !== creative.content_version_hash) return false;
    if (creative.starts_at && creative.starts_at > nowIso) return false;
    if (creative.ends_at && creative.ends_at < nowIso) return false;
    return !cooldown.has(creative.id);
  });
  if (!creatives.length) return [];

  const { data: patternRows } = await db
    .from("ad_resonance_patterns")
    .select("creative_id, dimensions, intents, languages, created_from_approved_content")
    .in(
      "creative_id",
      creatives.map((c) => c.id),
    )
    .is("invalidated_at", null);

  const patterns = new Map(
    ((patternRows ?? []) as any[])
      .filter((p) => p.created_from_approved_content)
      .map((p) => [p.creative_id as string, p]),
  );

  const scored = creatives
    .map((creative) => {
      const pattern = patterns.get(creative.id);
      if (!pattern) return null;
      const result = scoreAdAgainstUser({
        adDimensions: pattern.dimensions ?? {},
        adIntents: pattern.intents ?? [],
        adLanguages: pattern.languages ?? creative.languages ?? [],
        userDimensions: (userPattern.dimensions ?? {}) as Record<string, number>,
        userIntent: userPattern.intent,
        userModes: userPattern.connection_modes ?? [],
        userLanguages: userPattern.languages ?? [],
        freshnessDays: (now - new Date(creative.updated_at).getTime()) / 86_400_000,
        recentImpressions: recentCounts.get(creative.id) ?? 0,
      });
      return { creative, ...result };
    })
    .filter((entry): entry is { creative: CreativeRow; score: number; categories: string[] } => Boolean(entry))
    .filter((entry) => entry.score >= MINIMUM_RESONANCE_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, AD_DELIVERY.maxAdsPerPage);

  if (!scored.length) return [];

  const origin = context.origin ?? "https://crawler.today";
  const placements: SponsoredPlacement[] = [];
  for (const entry of scored) {
    const campaign = eligibleCampaigns.find((c) => c.id === entry.creative.campaign_id);
    const base: Omit<SponsoredPlacement, "text_fallback"> = {
      placement_id: `plc_${await encodeCreativeId(entry.creative.id)}`,
      type: "sponsored_placement",
      creative_id: await encodeCreativeId(entry.creative.id),
      campaign_id: await encodeCampaignId(entry.creative.campaign_id),
      label: AD_DISCLOSURE_LABEL,
      advertiser: campaign?.organizations?.name ?? "Business",
      advertiser_verified: Boolean(campaign?.organizations?.verified),
      product_name: entry.creative.product_name,
      headline: entry.creative.headline,
      body: entry.creative.body,
      image_alt: entry.creative.image_alt,
      image_reference: entry.creative.image_reference,
      call_to_action: entry.creative.call_to_action ?? "Learn more",
      destination_url: entry.creative.destination_url,
      destination_domain: entry.creative.destination_domain,
      knowledge_url: entry.creative.knowledge_slug ? `${origin}/knowledge/ads/${entry.creative.knowledge_slug}` : null,
      disclosure: `${AD_DISCLOSURE_LABEL} — This ad may resonate with your selected interests.`,
      matching_note: AD_MATCHING_NOTE,
      why_am_i_seeing_this: {
        explanation: AD_TRANSPARENCY_TEXT,
        categories: entry.categories,
        facts: AD_TRANSPARENCY_FACTS,
      },
      controls: [
        "hide_sponsored_placement",
        "report_sponsored_placement",
        "block_advertiser",
        "set_resonance_ads_preference",
      ],
    };
    placements.push({ ...base, text_fallback: buildTextFallback(base) });

    await db.from("sponsored_impressions").insert({
      creative_id: entry.creative.id,
      anonymous_frequency_key: key,
      placement_context: "universal_feed",
      resonance_bucket: resonanceBucket(entry.score),
      language: context.language ?? null,
    });
  }

  return placements;
}

/** Marks a hide/report/click on the person's own most recent impression. */
export async function markPlacementEvent(
  db: Db,
  subjectHash: string,
  creativeId: string,
  field: "clicked_at" | "hidden_at" | "reported_at",
) {
  const key = await frequencyKey(subjectHash);
  const { data } = await db
    .from("sponsored_impressions")
    .select("id")
    .eq("anonymous_frequency_key", key)
    .eq("creative_id", creativeId)
    .order("displayed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) {
    await db
      .from("sponsored_impressions")
      .update({ [field]: new Date().toISOString() })
      .eq("id", (data as { id: number }).id);
  }
}
