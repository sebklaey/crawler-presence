/**
 * Crawler Ads — creatives, Ad Knowledge Cores and Ad Resonance Patterns.
 *
 * One campaign belongs to a verified Business organisation and can carry many
 * creatives. Each creative advertises exactly one product and owns:
 *  - a public, clearly sponsored AI-readable Ad Knowledge Core,
 *  - its own abstract Ad Resonance Pattern derived only from approved content.
 *
 * Nothing here ever reads a person, a chat history or a user pattern.
 */
import { audit } from "../audit";
import { roomError } from "../errors";
import {
  requireEntitlement,
  requireOrganizationAccess,
  requireWritablePaidFeatures,
  type AccountContext,
} from "../entitlements";
import { encodeCampaignId, encodeCreativeId, decodeCreativeId } from "../ids";
import { screenCampaignCopy } from "../ads";
import { DIMENSION_KEYS, type Dimensions, type DimensionKey } from "../match/config";
import type { Db } from "../store";
import { AD_DISCLOSURE_LABEL, AD_MATCHING_NOTE, DELIVERABLE_CREATIVE_STATUSES } from "./config";

export const CREATIVE_COLUMNS =
  "id, campaign_id, product_reference, product_name, product_description, product_category, headline, body, image_reference, image_alt, destination_url, destination_domain, call_to_action, languages, status, knowledge_slug, content_version_hash, approved_content_hash, starts_at, ends_at, created_at, updated_at";

export interface CreativeRow {
  id: string;
  campaign_id: string;
  product_reference: string | null;
  product_name: string;
  product_description: string | null;
  product_category: string | null;
  headline: string;
  body: string;
  image_reference: string | null;
  image_alt: string | null;
  destination_url: string;
  destination_domain: string;
  call_to_action: string | null;
  languages: string[];
  status: string;
  knowledge_slug: string | null;
  content_version_hash: string | null;
  approved_content_hash: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

/* ------------------------------ safe targets ------------------------------ */

/** HTTPS-only, no credentials, no private hosts, no javascript:/data:/file:. */
export function validateDestination(raw: string): { url: string; domain: string } {
  let parsed: URL;
  try {
    // Reuse the hardened SSRF/phishing checks used for source URLs.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    parsed = assertSafe(raw);
  } catch (error) {
    throw roomError("CAMPAIGN_INVALID", (error as Error).message);
  }
  return { url: parsed.toString(), domain: parsed.hostname.toLowerCase() };
}

/** Synchronous copy of the shared safety assertions (Worker-safe, no fetch). */
function assertSafe(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That is not a valid URL.");
  }
  if (url.protocol !== "https:") throw new Error("Only https:// destination URLs are allowed.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"].includes(host)) {
    throw new Error("That host is not allowed.");
  }
  if (host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    throw new Error("Only public hostnames are allowed.");
  }
  if (/^(10|127)\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error("Private network addresses are not allowed.");
  }
  if (host.includes(":")) throw new Error("Raw IPv6 addresses are not allowed.");
  if (url.username || url.password) throw new Error("Credentials in the URL are not allowed.");
  return url;
}

/* ---------------------------- content versioning --------------------------- */

/** Every field that, when changed, requires a fresh review. */
export function contentFingerprintSource(creative: Partial<CreativeRow>): string {
  return JSON.stringify([
    creative.product_name ?? "",
    creative.product_description ?? "",
    creative.headline ?? "",
    creative.body ?? "",
    creative.image_reference ?? "",
    creative.image_alt ?? "",
    creative.destination_url ?? "",
    creative.call_to_action ?? "",
  ]);
}

export async function contentVersionHash(creative: Partial<CreativeRow>): Promise<string> {
  const { sha256Hex } = await import("../crypto");
  return sha256Hex(new TextEncoder().encode(contentFingerprintSource(creative)));
}

/* -------------------------- ad resonance patterns -------------------------- */

/**
 * Deterministic, abstract lexicon. Only non-sensitive style, interest,
 * communication and intention signals are ever derived. Sensitive categories
 * (health, religion, politics, sexuality, finances, …) have no representation
 * here and can therefore not be targeted.
 */
const LEXICON: Record<DimensionKey, RegExp> = {
  creative: /\b(creativ|design|art|story|storytelling|brand|visual|music|film|kreativ|gestalt)\w*/i,
  technical: /\b(ai|ki|api|code|software|engineer|develop|data|model|platform|technisch|technolog)\w*/i,
  entrepreneurial: /\b(startup|business|founder|growth|revenue|market|sell|studio|agency|unternehm)\w*/i,
  social: /\b(community|social|network|people|share|audience|together|gemeinschaft)\w*/i,
  reflective: /\b(research|insight|analys|essay|philosoph|reflect|think|strateg|studie)\w*/i,
  experimental: /\b(experiment|prototype|beta|novel|explor|playful|labs?|new approach|neuartig)\w*/i,
  structured: /\b(system|process|framework|workflow|method|reliab|struct|standard)\w*/i,
  spontaneous: /\b(quick|instant|spontan|fast|live|realtime|adhoc)\w*/i,
  local_orientation: /\b(local|regional|city|switzerland|schweiz|nearby|vor ort)\w*/i,
  global_orientation: /\b(global|worldwide|international|remote|anywhere|weltweit)\w*/i,
  collaboration_intensity: /\b(collaborat|partner|team|co-?creat|workshop|zusammenarbeit)\w*/i,
  conversation_depth: /\b(deep|in-?depth|conversation|dialog|consult|advis|mentor|tiefgehend)\w*/i,
};

const INTENT_LEXICON: Array<{ intent: string; pattern: RegExp }> = [
  { intent: "creative_collaboration", pattern: LEXICON.creative },
  { intent: "professional_exchange", pattern: LEXICON.entrepreneurial },
  { intent: "building_something", pattern: LEXICON.technical },
  { intent: "learning", pattern: /\b(learn|course|tutorial|guide|kurs|lernen)\w*/i },
  { intent: "thinking_together", pattern: LEXICON.reflective },
];

/** Derives the abstract pattern from APPROVED ad content only. */
export function deriveAdDimensions(text: string): Dimensions {
  const words = Math.max(text.split(/\s+/).length, 1);
  const dimensions: Dimensions = {};
  for (const key of DIMENSION_KEYS) {
    const matches = text.match(new RegExp(LEXICON[key].source, "gi"))?.length ?? 0;
    // Saturating, normalised signal — never a raw count, never per person.
    const score = matches === 0 ? 0.25 : Math.min(0.95, 0.45 + Math.log1p(matches) / Math.log1p(words / 4 + 2));
    dimensions[key] = Math.round(score * 100) / 100;
  }
  return dimensions;
}

export function deriveAdIntents(text: string): string[] {
  const intents = INTENT_LEXICON.filter((entry) => entry.pattern.test(text)).map((entry) => entry.intent);
  return intents.length ? intents.slice(0, 3) : ["professional_exchange"];
}

export interface AdPattern {
  schema_version: string;
  creative_id: string;
  dimensions: Dimensions;
  intents: string[];
  languages: string[];
  created_from_approved_content: boolean;
  version: number;
}

export function buildAdPattern(creative: CreativeRow, approved: boolean, version = 1): AdPattern {
  const text = [
    creative.product_name,
    creative.product_description,
    creative.headline,
    creative.body,
    creative.product_category,
    creative.call_to_action,
  ]
    .filter(Boolean)
    .join(" \n ");
  return {
    schema_version: "1.0",
    creative_id: creative.id,
    dimensions: deriveAdDimensions(text),
    intents: deriveAdIntents(text),
    languages: creative.languages ?? ["en"],
    created_from_approved_content: approved,
    version,
  };
}

/** Stores (or replaces) the pattern for a creative. */
export async function storeAdPattern(db: Db, creative: CreativeRow, approved: boolean) {
  const { data: previous } = await db
    .from("ad_resonance_patterns")
    .select("id, version")
    .eq("creative_id", creative.id)
    .is("invalidated_at", null)
    .maybeSingle();

  if (previous) {
    await db
      .from("ad_resonance_patterns")
      .update({ invalidated_at: new Date().toISOString() })
      .eq("id", (previous as { id: string }).id);
  }

  const version = ((previous as { version?: number } | null)?.version ?? 0) + 1;
  const pattern = buildAdPattern(creative, approved, version);
  await db.from("ad_resonance_patterns").insert({
    creative_id: creative.id,
    schema_version: pattern.schema_version,
    dimensions: pattern.dimensions,
    intents: pattern.intents,
    languages: pattern.languages,
    content_version_hash: creative.content_version_hash,
    version,
    created_from_approved_content: approved,
  });
  return pattern;
}

/* ---------------------------- ad knowledge core ---------------------------- */

export function adKnowledgeSlug(campaignId: string, productName: string): string {
  const base = productName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${base || "ad"}-${campaignId.slice(0, 8)}`;
}

export interface AdKnowledgeCore {
  schema_version: "1.0";
  content_type: "sponsored_knowledge";
  ad_id: string;
  campaign_id: string;
  advertiser: { name: string; crawler_presence_url: string | null };
  product: { name: string; description: string; category: string | null };
  creative: {
    headline: string;
    body: string;
    image_url: string | null;
    image_alt: string | null;
    call_to_action: string;
    destination_url: string;
  };
  advertiser_claims: string[];
  marketing_narrative: string;
  disclosure: { sponsored: true; label: string; matching: string };
  status: string;
  published_at: string | null;
  updated_at: string;
}

/** Marketing sentences are separated out and never presented as verified fact. */
export function splitClaims(body: string): { claims: string[]; narrative: string } {
  const sentences = body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const claimLike = /\b(best|leading|first|award|guarantee|fastest|cheapest|#1|beste|führend|garantie)\b/i;
  const claims = sentences.filter((s) => claimLike.test(s));
  return { claims, narrative: sentences.filter((s) => !claims.includes(s)).join(" ") };
}

export async function buildAdKnowledgeCore(
  db: Db,
  creative: CreativeRow,
  origin = "https://crawler.today",
): Promise<AdKnowledgeCore> {
  const { data: campaign } = await db
    .from("sponsored_campaigns")
    .select("id, status, organization_id, organizations(name, slug)")
    .eq("id", creative.campaign_id)
    .maybeSingle();
  const org = (campaign as any)?.organizations ?? null;
  const { claims, narrative } = splitClaims(creative.body);

  return {
    schema_version: "1.0",
    content_type: "sponsored_knowledge",
    ad_id: await encodeCreativeId(creative.id),
    campaign_id: await encodeCampaignId(creative.campaign_id),
    advertiser: {
      name: org?.name ?? "Business",
      crawler_presence_url: org?.slug ? `${origin}/p/${org.slug}` : null,
    },
    product: {
      name: creative.product_name,
      description: creative.product_description ?? "",
      category: creative.product_category,
    },
    creative: {
      headline: creative.headline,
      body: creative.body,
      image_url: creative.image_reference ? `${origin}/api/public/room.upload?ref=${creative.image_reference}` : null,
      image_alt: creative.image_alt,
      call_to_action: creative.call_to_action ?? "Learn more",
      destination_url: creative.destination_url,
    },
    advertiser_claims: claims,
    marketing_narrative: narrative,
    disclosure: {
      sponsored: true,
      label: AD_DISCLOSURE_LABEL,
      matching: "Displayed through privacy-preserving resonance matching",
    },
    status: DELIVERABLE_CREATIVE_STATUSES.includes(creative.status as never) ? "active" : creative.status,
    published_at: creative.approved_content_hash ? creative.updated_at : null,
    updated_at: creative.updated_at,
  };
}

export function adKnowledgeMarkdown(core: AdKnowledgeCore): string {
  return [
    `# ${AD_DISCLOSURE_LABEL}: ${core.product.name}`,
    "",
    `> This page is **sponsored content** paid for by ${core.advertiser.name}. It is not a Crawler recommendation, not an editorial article and not a verified fact statement. ${AD_MATCHING_NOTE}`,
    "",
    `## Product`,
    core.product.description || "_No factual description provided._",
    core.product.category ? `\nCategory: ${core.product.category}` : "",
    "",
    `## Advertiser creative`,
    `**${core.creative.headline}**`,
    "",
    core.marketing_narrative || core.creative.body,
    "",
    core.advertiser_claims.length
      ? `## Advertiser claims (unverified)\n${core.advertiser_claims.map((c) => `- ${c}`).join("\n")}`
      : "",
    "",
    `## Call to action`,
    `[${core.creative.call_to_action}](${core.creative.destination_url})`,
    "",
    `## Advertiser`,
    `${core.advertiser.name}${core.advertiser.crawler_presence_url ? ` — ${core.advertiser.crawler_presence_url}` : ""}`,
    "",
    `## Disclosure`,
    `- Sponsored: yes`,
    `- Label: ${core.disclosure.label}`,
    `- Matching: ${core.disclosure.matching}`,
    `- Status: ${core.status}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/* -------------------------------- creatives -------------------------------- */

async function requireBusinessCampaign(db: Db, ctx: AccountContext, campaignId: string) {
  const { data } = await db
    .from("sponsored_campaigns")
    .select("id, organization_id, status, title")
    .eq("id", campaignId)
    .maybeSingle();
  if (!data) throw roomError("NOT_FOUND");
  requireEntitlement(ctx, "campaigns");
  requireWritablePaidFeatures(ctx);
  const org = await requireOrganizationAccess(db, ctx, (data as any).organization_id);
  if (org.suspended) throw roomError("FORBIDDEN");
  return { campaign: data as any, org };
}

export interface CreativeInput {
  campaignId: string;
  productName: string;
  productDescription?: string;
  productCategory?: string;
  productReference?: string;
  headline: string;
  body: string;
  imageReference?: string;
  imageAlt?: string;
  destinationUrl: string;
  callToAction?: string;
  languages?: string[];
  startsAt?: string;
  endsAt?: string;
}

export async function addCampaignCreative(db: Db, ctx: AccountContext, input: CreativeInput) {
  const { campaign, org } = await requireBusinessCampaign(db, ctx, input.campaignId);
  const destination = validateDestination(input.destinationUrl);

  const policy = screenCampaignCopy({
    title: `${input.productName} ${input.headline}`,
    description: `${input.body} ${input.productDescription ?? ""}`,
    ctaLabel: input.callToAction ?? null,
    ctaUrl: destination.url,
    organizationName: org.name,
  });
  if (!policy.ok) throw roomError("POLICY_VIOLATION", undefined, { violations: policy.violations });

  if (input.imageReference && !input.imageAlt?.trim()) {
    throw roomError("CAMPAIGN_INVALID", "Ein Bild benötigt immer einen Alt-Text.");
  }

  const draft: Partial<CreativeRow> = {
    product_name: input.productName.slice(0, 120),
    product_description: (input.productDescription ?? "").slice(0, 800),
    headline: input.headline.slice(0, 120),
    body: input.body.slice(0, 800),
    image_reference: input.imageReference ?? null,
    image_alt: input.imageAlt?.slice(0, 200) ?? null,
    destination_url: destination.url,
    call_to_action: input.callToAction?.slice(0, 60) ?? "Learn more",
  };
  const hash = await contentVersionHash(draft);

  const { data, error } = await db
    .from("ad_creatives")
    .insert({
      campaign_id: campaign.id,
      product_reference: input.productReference ?? null,
      product_category: input.productCategory?.slice(0, 80) ?? null,
      languages: (input.languages ?? ["en"]).map((l) => l.toLowerCase().slice(0, 2)).slice(0, 6),
      status: "draft",
      knowledge_slug: adKnowledgeSlug(campaign.id, input.productName),
      content_version_hash: hash,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      ...draft,
      destination_domain: destination.domain,
    })
    .select(CREATIVE_COLUMNS)
    .single();
  if (error || !data) throw roomError("CAMPAIGN_INVALID", error?.message);

  const creative = data as unknown as CreativeRow;
  // Draft pattern: derived, but explicitly not from approved content yet.
  await storeAdPattern(db, creative, false);

  await audit(db, {
    actorType: "organization",
    actorId: org.id,
    action: "campaign.creative.create",
    targetType: "campaign",
    targetId: campaign.id,
  });

  return {
    creative_id: await encodeCreativeId(creative.id),
    campaign_id: await encodeCampaignId(campaign.id),
    status: creative.status,
    knowledge_slug: creative.knowledge_slug,
    message:
      "Creative als Entwurf angelegt. Es wird erst nach Prüfung und Freigabe ausgespielt und ist immer als Anzeige gekennzeichnet.",
  };
}

export async function listCreatives(db: Db, campaignId: string): Promise<CreativeRow[]> {
  const { data } = await db
    .from("ad_creatives")
    .select(CREATIVE_COLUMNS)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as CreativeRow[];
}

export async function resolveCreativeId(external: unknown): Promise<string> {
  const id = await decodeCreativeId(external);
  if (!id) throw roomError("NOT_FOUND");
  return id;
}

/** Full, non-publishing preview of everything an approved ad would produce. */
export async function previewCampaign(db: Db, ctx: AccountContext, campaignId: string, origin?: string) {
  const { campaign, org } = await requireBusinessCampaign(db, ctx, campaignId);
  const creatives = await listCreatives(db, campaign.id);

  const previews = [];
  for (const creative of creatives) {
    const core = await buildAdKnowledgeCore(db, creative, origin);
    previews.push({
      creative_id: await encodeCreativeId(creative.id),
      status: creative.status,
      needs_new_review: creative.approved_content_hash !== creative.content_version_hash,
      ad_knowledge_core: core,
      ad_knowledge_paths: {
        page: `/knowledge/ads/${creative.knowledge_slug}`,
        markdown: `/knowledge/ads/${creative.knowledge_slug}.md`,
        json: `/api/ads/${await encodeCreativeId(creative.id)}.json`,
      },
      sponsored_card: {
        label: AD_DISCLOSURE_LABEL,
        advertiser: org.name,
        product: creative.product_name,
        headline: creative.headline,
        body: creative.body,
        image_alt: creative.image_alt,
        call_to_action: creative.call_to_action ?? "Learn more",
        destination_domain: creative.destination_domain,
      },
      ad_resonance_pattern: buildAdPattern(creative, creative.approved_content_hash === creative.content_version_hash),
    });
  }

  return {
    campaign_id: await encodeCampaignId(campaign.id),
    campaign_status: campaign.status,
    advertiser: org.name,
    creatives: previews,
    published: false,
    note: "Vorschau. Nichts wird dadurch veröffentlicht — jede Anzeige braucht weiterhin eine Freigabe.",
  };
}

/**
 * Approving a campaign approves its complete creatives and (re)builds their
 * patterns from the approved content. Content changed after approval is never
 * delivered.
 */
export async function approveCreativesForCampaign(db: Db, campaignId: string) {
  const creatives = await listCreatives(db, campaignId);
  for (const creative of creatives) {
    if (!creative.destination_url || !creative.headline || !creative.body) continue;
    if (creative.image_reference && !creative.image_alt) continue;
    await db
      .from("ad_creatives")
      .update({
        status: "approved",
        approved_content_hash: creative.content_version_hash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", creative.id);
    await storeAdPattern(db, { ...creative, status: "approved" }, true);
  }
  return creatives.length;
}

/** Any content change pauses the creative and forces a fresh review. */
export async function invalidateCreativesForCampaign(db: Db, campaignId: string, status = "changes_requested") {
  await db
    .from("ad_creatives")
    .update({ status, approved_content_hash: null, updated_at: new Date().toISOString() })
    .eq("campaign_id", campaignId);
  await db
    .from("ad_resonance_patterns")
    .update({ invalidated_at: new Date().toISOString() })
    .in(
      "creative_id",
      (await listCreatives(db, campaignId)).map((c) => c.id),
    );
}
