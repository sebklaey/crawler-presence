/**
 * Crawler Ads — aggregated, privacy-preserving campaign analytics.
 *
 * Never returns a session id, handle, profile, message, user resonance pattern
 * or an individual match reason. Segments below the minimum group size are
 * suppressed and only totals are reported.
 */
import { requireEntitlement, requireOrganizationAccess, type AccountContext } from "../entitlements";
import { encodeCampaignId, encodeCreativeId } from "../ids";
import type { Db } from "../store";
import { MIN_SEGMENT_EVENTS } from "./config";
import { listCreatives } from "./creatives";

type ImpressionRow = {
  creative_id: string;
  displayed_at: string;
  clicked_at: string | null;
  hidden_at: string | null;
  reported_at: string | null;
  resonance_bucket: string | null;
  language: string | null;
  anonymous_frequency_key: string;
};

export async function creativeAnalytics(db: Db, ctx: AccountContext, organizationId: string) {
  requireEntitlement(ctx, "campaigns");
  await requireOrganizationAccess(db, ctx, organizationId);

  const { data: campaigns } = await db
    .from("sponsored_campaigns")
    .select("id, title, status")
    .eq("organization_id", organizationId);

  const results = [];
  for (const campaign of ((campaigns ?? []) as any[])) {
    const creatives = await listCreatives(db, campaign.id);
    if (!creatives.length) continue;

    const { data } = await db
      .from("sponsored_impressions")
      .select(
        "creative_id, displayed_at, clicked_at, hidden_at, reported_at, resonance_bucket, language, anonymous_frequency_key",
      )
      .in(
        "creative_id",
        creatives.map((c) => c.id),
      )
      .limit(20000);
    const rows = (data ?? []) as ImpressionRow[];

    const perCreative = [];
    for (const creative of creatives) {
      const own = rows.filter((r) => r.creative_id === creative.id);
      const impressions = own.length;
      const clicks = own.filter((r) => r.clicked_at).length;
      const enough = impressions >= MIN_SEGMENT_EVENTS;
      perCreative.push({
        creative_id: await encodeCreativeId(creative.id),
        product_name: creative.product_name,
        status: creative.status,
        impressions,
        unique_impressions: enough ? new Set(own.map((r) => r.anonymous_frequency_key)).size : null,
        clicks,
        click_through_rate: impressions ? Math.round((clicks / impressions) * 1000) / 1000 : null,
        hidden: own.filter((r) => r.hidden_at).length,
        reported: own.filter((r) => r.reported_at).length,
        resonance_band: enough
          ? [...new Set(own.map((r) => r.resonance_bucket).filter(Boolean))].sort().join(", ")
          : null,
        by_language: enough ? byLanguage(own) : null,
        by_day: enough ? byDay(own) : null,
        segment_note: enough
          ? null
          : `Zu wenige Ereignisse für eine segmentierte Auswertung (Mindestgruppe: ${MIN_SEGMENT_EVENTS}). Es werden nur Gesamtwerte gezeigt.`,
      });
    }

    results.push({
      campaign_id: await encodeCampaignId(campaign.id),
      title: campaign.title,
      status: campaign.status,
      creatives: perCreative,
    });
  }

  return {
    campaigns: results,
    privacy_note:
      "Aggregierte Auswertung. Crawler gibt keine Session-IDs, Handles, Profile, Nachrichten oder User-Resonanzmuster an Werbekunden weiter.",
  };
}

function byLanguage(rows: ImpressionRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.language ?? "unspecified";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_SEGMENT_EVENTS)
    .map(([language, impressions]) => ({ language, impressions }));
}

function byDay(rows: ImpressionRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const day = row.displayed_at.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()].sort().map(([day, impressions]) => ({ day, impressions }));
}
