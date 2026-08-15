/**
 * MCP tools for plans, owned rooms, the Universal Room and advertising.
 *
 * Every handler derives identity from MCP `_meta`, resolves entitlements
 * server-side and refuses anything the plan, role or ownership does not allow.
 */
import { z } from "zod";

import {
  adminReviewCampaign,
  campaignAnalytics,
  createCampaign,
  hideCampaign,
  manageCampaign,
  reportCampaign,
  resolveCampaignId,
  submitCampaignForReview,
} from "./ads";
import { sanitizeAlias } from "./alias";
import { roomError } from "./errors";
import { trySugarActivity } from "./sugar/service";
import {
  currentUsage,
  requireEntitlement,
  requireOrganizationAccess,

  resolveEntitlements,
  upgradeOptions,
  type AccountContext,
} from "./entitlements";
import { resolveIdentity, type McpMeta } from "./identity";
import { encodeRoomId, decodeRoomId } from "./ids";
import { listPlans } from "./plans";
import {
  acceptInvitation,
  createInvitation,
  createOwnedRoom,
  manageRoom,
  revokeInvitation,
} from "./privaterooms";
import { getDb, type Db } from "./store";
import {
  enterUniversal,
  presenceLabel,
  sendUniversalMessage,
  universalFeed,
} from "./universal";

const REPORT_REASONS = [
  "spam",
  "misleading",
  "offensive",
  "scam",
  "irrelevant",
  "other",
] as const;

export const plusInputSchemas = {
  get_my_plan: z
    .object({
      recovery_code: z.string().min(6).max(200).optional(),
      session_id: z.string().min(6).max(200).optional(),
    })
    .strict(),
  create_public_room: z
    .object({
      title: z.string().min(2).max(120),
      description: z.string().max(1000).optional(),
      topic: z.string().max(64).optional(),
      visibility: z.literal("public").default("public"),
      capacity: z.number().int().min(2).max(5000).optional(),
      /** "community" creates (or reuses) an organization-backed room. */
      kind: z.enum(["room", "community"]).optional(),
      /** Existing organization: uuid, slug or exact name. */
      organization_id: z.string().max(200).optional(),
      organization_name: z.string().max(120).optional(),
    })
    // Not strict: assistants often add harmless extra fields; those are ignored
    // instead of failing the whole call with an argument error.
    .passthrough(),

  manage_room: z
    .object({
      room_id: z.string().min(1),
      action: z.enum([
        "update",
        "archive",
        "delete",
        "update_retention",
        "assign_moderator",
        "remove_moderator",
      ]),
      payload: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
  create_invitation: z
    .object({
      room_id: z.string().min(1),
      expires_in_hours: z.number().int().min(1).max(720).optional(),
      max_uses: z.number().int().min(1).max(10000).optional(),
      revoke_token: z.string().optional(),
    })
    .strict(),
  join_invitation: z.object({ invitation_token: z.string().min(8) }).strict(),
  list_universal: z
    .object({
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      topic: z.string().max(64).optional(),
    })
    .strict(),
  enter_universal: z.object({ alias: z.string().optional() }).strict(),
  send_universal_message: z
    .object({ text: z.string(), idempotency_key: z.string().max(80).optional() })
    .strict(),
  create_sponsored_campaign: z
    .object({
      organization_id: z.string().uuid(),
      title: z.string().min(3).max(120),
      description: z.string().min(10).max(1000),
      topics: z.array(z.string().max(64)).min(1).max(10),
      cover_image_reference: z.string().max(300).optional(),
      call_to_action: z.string().max(60).optional(),
      destination_url: z.string().url().optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      budget_cents: z.number().int().min(0).optional(),
      languages: z.array(z.string().max(8)).max(10).optional(),
    })
    .strict(),
  submit_campaign_for_review: z.object({ campaign_id: z.string().min(1) }).strict(),
  manage_campaign: z
    .object({
      campaign_id: z.string().min(1),
      action: z.enum(["update", "pause", "resume", "cancel"]),
      payload: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
  get_campaign_analytics: z.object({ organization_id: z.string().uuid() }).strict(),
  hide_sponsored_placement: z
    .object({ campaign_id: z.string().min(1), creative_id: z.string().min(1).optional() })
    .strict(),
  report_sponsored_placement: z
    .object({
      campaign_id: z.string().min(1),
      creative_id: z.string().min(1).optional(),
      reason: z.enum(REPORT_REASONS),
    })
    .strict(),

  admin_review_campaign: z
    .object({
      campaign_id: z.string().min(1),
      action: z.enum(["approve", "reject", "request_changes", "suspend"]),
      reason: z.string().max(500).optional(),
    })
    .strict(),
};

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) throw roomError("INVALID_INPUT");
  return result.data;
}

async function context(meta: McpMeta): Promise<{ db: Db; ctx: AccountContext }> {
  const identity = await resolveIdentity(meta);
  const db = await getDb();
  const ctx = await resolveEntitlements(db, identity.subjectHash);
  const { touchPresence } = await import("./store");
  await touchPresence(db, identity.subjectHash);
  return { db, ctx };
}

/* ------------------------------- plan tool ------------------------------- */

export async function handleGetMyPlan(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.get_my_plan, input);
  const identity = await resolveIdentity(meta);
  const db = await getDb();


  let linked: { plan: string; presenceSlug: string } | null = null;
  let linkError: string | null = null;

  // A paid draft session (sess_…) is proof of entitlement on its own. The
  // wrapper already forwards it, and passing it directly also works.
  const sessionId =
    data.session_id ??
    (typeof (meta as Record<string, unknown> | undefined)?.["crawler/session_id"] === "string"
      ? String((meta as Record<string, unknown>)["crawler/session_id"])
      : null);
  let sessionPlan: string | null = null;
  let sessionError: string | null = null;
  if (sessionId) {
    const { linkSessionPlanToRoomToken, resolvePlanForSession } = await import(
      "../entitlements/guard.server"
    );
    const { readSubject } = await import("./identity");
    sessionPlan = await resolvePlanForSession(sessionId);
    if (sessionPlan === "free") {
      sessionError =
        "Zu dieser Session ist kein aktives bezahltes Abo hinterlegt. Nutze den Wiederherstellungscode der bezahlten Presence (recovery_code).";
    } else {
      await linkSessionPlanToRoomToken(readSubject(meta), sessionId);
    }
  }

  if (data.recovery_code) {
    const { linkPlanByRecoveryCode } = await import("./planlink");
    linked = await linkPlanByRecoveryCode(db, identity.subjectHash, data.recovery_code);
    if (!linked) linkError = "Dieser Wiederherstellungscode ist ungültig oder das Abo ist nicht aktiv.";
  }

  const ctx = await resolveEntitlements(db, identity.subjectHash);
  const usage = await currentUsage(db, ctx);
  const locked = await upgradeOptions(db, ctx);
  const { publicFeatures, planCheckoutUrl } = await import("./entitlements");
  const nextPlan = ctx.plan.code === "free" ? "plus" : ctx.plan.code === "plus" ? "pro" : "business";
  const upgradeUrl = await planCheckoutUrl(ctx.plan.code === "business" ? "" : nextPlan);
  const checkout = {
    plus: await planCheckoutUrl("plus"),
    pro: await planCheckoutUrl("pro"),
    business: await planCheckoutUrl("business"),
  };
  return {
    plan: ctx.plan.code,
    plan_name: ctx.plan.name,
    price_usd: ctx.plan.price_cents / 100,
    linked_presence: linked?.presenceSlug ?? null,
    link_error: linkError,
    session_id_checked: sessionId ? true : false,
    session_plan: sessionPlan,
    session_link_error: sessionError,
    features: publicFeatures(ctx.entitlements),
    limits: ctx.limits,
    usage,
    locked,
    upgrade_url: upgradeUrl,
    checkout_urls: checkout,
    notice:
      ctx.plan.code === "free"
        ? `Du nutzt @crawler Rooms gratis: öffentliche Themenräume und der Universal Room sind frei. Eigene öffentliche Räume (Plus $5/Monat), Communities (Pro $20/Monat) und Organisationen (Business $80/Monat) sind Teil des Crawler-Abos. Direkt kaufen: Plus ${checkout.plus} · Pro ${checkout.pro} · Business ${checkout.business}. Nach dem Kauf den Wiederherstellungscode hier mit recovery_code angeben.`
        : `Aktives Abo: ${ctx.plan.name}.${ctx.plan.code === "business" ? "" : ` Upgrade direkt kaufen: ${upgradeUrl}`}`,
  };
}

export async function handlePublicPlans() {
  const db = await getDb();
  const plans = await listPlans(db);
  const { publicFeatures, planCheckoutUrl } = await import("./entitlements");
  return {
    free_tier: "Öffentliche Themenräume und der Universal Room sind kostenlos.",
    upgrade_url: await planCheckoutUrl("plus"),
    extensions: await Promise.all(
      plans.map(async (plan) => ({
        code: plan.code,
        name: plan.name,
        tagline: plan.tagline ?? "",
        price_usd: plan.price_cents / 100,
        interval: plan.interval,
        limits: plan.limits,
        entitlements: publicFeatures(plan.entitlements ?? {}),
        checkout_url: await planCheckoutUrl(plan.code),
      })),
    ),
  };
}


/* ------------------------------ owned rooms ------------------------------ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Resolves an organization by uuid, slug or name for the current owner and
 * creates one on demand, so a community can be created in a single call.
 */
async function resolveOrganization(
  db: Db,
  ctx: AccountContext,
  reference: string | undefined,
  fallbackName: string,
): Promise<string> {
  requireEntitlement(ctx, "communities");

  if (reference) {
    const column = UUID_RE.test(reference) ? "id" : "slug";
    const { data: found } = await db
      .from("organizations")
      .select("id")
      .eq(column, UUID_RE.test(reference) ? reference : slugify(reference))
      .maybeSingle();
    if (found) {
      const org = await requireOrganizationAccess(db, ctx, (found as { id: string }).id);
      return org.id;
    }
  }

  const name = (reference && !UUID_RE.test(reference) ? reference : fallbackName).slice(0, 120);
  const { data: existing } = await db
    .from("organizations")
    .select("id")
    .eq("owner_account_id", ctx.accountId)
    .eq("name", name)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: created, error } = await db
    .from("organizations")
    .insert({
      name,
      slug: `${slugify(name) || "community"}-${Math.random().toString(36).slice(2, 8)}`,
      owner_account_id: ctx.accountId,
    })
    .select("id")
    .single();
  if (error || !created) throw roomError("INTERNAL_ERROR");

  await db.from("organization_members").insert({
    organization_id: (created as { id: string }).id,
    account_id: ctx.accountId,
    role: "organization_admin",
  });

  return (created as { id: string }).id;
}

export async function handleCreatePublicRoom(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.create_public_room, input);
  const { db, ctx } = await context(meta);

  const wantsCommunity = data.kind === "community" || Boolean(data.organization_id || data.organization_name);
  const organizationId = wantsCommunity
    ? await resolveOrganization(db, ctx, data.organization_id ?? data.organization_name, data.title)
    : null;

  const room = await createOwnedRoom(db, ctx, {
    title: data.title,
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.topic !== undefined ? { topic: data.topic } : {}),
    visibility: "public",
    ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
    ...(organizationId ? { organizationId } : {}),
  });

  const invitation = ctx.entitlements["invitations"]
    ? await createInvitation(db, ctx, room.id, { expiresInHours: 168 })
    : null;

  return {
    room_id: await encodeRoomId(room.id),
    title: room.title,
    kind: room.kind,
    organization_id: organizationId,
    visibility: room.visibility,
    capacity: room.capacity,
    retention: { texts: room.retention_texts, images: room.retention_images },
    invitation_token: invitation?.invitation_token ?? null,
    message:
      room.kind === "community"
        ? `Community «${room.title}» wurde erstellt.`
        : `Raum «${room.title}» wurde erstellt.`,
  };
}


export async function handleManageRoom(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.manage_room, input);
  const { db, ctx } = await context(meta);
  const roomId = await decodeRoomId(data.room_id);
  if (!roomId) throw roomError("NOT_FOUND");
  return manageRoom(db, ctx, roomId, data.action, data.payload ?? {});
}

export async function handleCreateInvitation(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.create_invitation, input);
  const { db, ctx } = await context(meta);

  if (data.revoke_token) {
    await revokeInvitation(db, ctx, data.revoke_token);
    return { revoked: true, message: "Einladung wurde widerrufen." };
  }

  const roomId = await decodeRoomId(data.room_id);
  if (!roomId) throw roomError("NOT_FOUND");
  const invitation = await createInvitation(db, ctx, roomId, {
    ...(data.expires_in_hours !== undefined ? { expiresInHours: data.expires_in_hours } : {}),
    ...(data.max_uses !== undefined ? { maxUses: data.max_uses } : {}),
  });
  return { ...invitation, message: "Teile diesen Einladungscode nur mit Personen, die du kennst." };
}

export async function handleJoinInvitation(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.join_invitation, input);
  const { db, ctx } = await context(meta);
  const result = await acceptInvitation(db, ctx.subjectHash, ctx.accountId, data.invitation_token);
  return {
    room_id: await encodeRoomId(result.room.id),
    title: result.room.title,
    alias: result.alias,
    joined_now: result.joined_now,
    message: result.joined_now ? `Du bist «${result.room.title}» beigetreten.` : "Du bist bereits Mitglied.",
  };
}

/* ----------------------------- universal room ----------------------------- */

export async function handleEnterUniversal(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.enter_universal, input);
  const { db, ctx } = await context(meta);

  let alias: string | null = ctx.customAlias;
  if (data.alias) {
    requireEntitlement(ctx, "custom_alias");
    alias = sanitizeAlias(data.alias);
    if (alias) {
      await db.from("anonymous_identities").update({ custom_alias: alias }).eq("subject_hash", ctx.subjectHash);
    }
  }

  const membership = await enterUniversal(db, ctx.subjectHash, alias);
  const feed = await universalFeed(db, ctx.subjectHash, membership, { limit: 20 });
  const presence = presenceLabel(membership.presence);

  return {
    joined_now: membership.joinedNow,
    alias: membership.alias,
    presence: presence.bucket,
    online_now: (feed.room as any).online_now,
    ...feed,
  };
}

export async function handleListUniversal(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.list_universal, input);
  const { db, ctx } = await context(meta);
  const membership = await enterUniversal(db, ctx.subjectHash, ctx.customAlias);
  return universalFeed(db, ctx.subjectHash, membership, {
    cursor: data.cursor ?? null,
    ...(data.limit !== undefined ? { limit: data.limit } : {}),
    topic: data.topic ?? null,
  });
}

export async function handleSendUniversalMessage(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.send_universal_message, input);
  const { db, ctx } = await context(meta);
  const membership = await enterUniversal(db, ctx.subjectHash, ctx.customAlias);
  const sent = await sendUniversalMessage(
    db,
    ctx.subjectHash,
    membership,
    data.text,
    data.idempotency_key ?? null,
  );
  await trySugarActivity(db, ctx.subjectHash, "send_universal_message");
  const feed = await universalFeed(db, ctx.subjectHash, membership, { limit: 20 });
  return { sent: true, duplicate: sent.duplicate, sent_message: sent.message, ...feed };
}

/* ------------------------------- campaigns ------------------------------- */

export async function handleCreateSponsoredCampaign(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.create_sponsored_campaign, input);
  const { db, ctx } = await context(meta);
  const result = await createCampaign(db, ctx, {
    organizationId: data.organization_id,
    title: data.title,
    description: data.description,
    topics: data.topics,
    ...(data.cover_image_reference !== undefined ? { coverPath: data.cover_image_reference } : {}),
    ...(data.call_to_action !== undefined ? { ctaLabel: data.call_to_action } : {}),
    ...(data.destination_url !== undefined ? { ctaUrl: data.destination_url } : {}),
    ...(data.start_date !== undefined ? { startsAt: data.start_date } : {}),
    ...(data.end_date !== undefined ? { endsAt: data.end_date } : {}),
    ...(data.budget_cents !== undefined ? { budgetCents: data.budget_cents } : {}),
    ...(data.languages !== undefined ? { languages: data.languages } : {}),
  });
  return {
    ...result,
    message:
      "Kampagne als Entwurf angelegt. Sie wird erst nach Prüfung und Freigabe sichtbar und immer als Anzeige gekennzeichnet.",
  };
}

export async function handleSubmitCampaignForReview(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.submit_campaign_for_review, input);
  const { db, ctx } = await context(meta);
  return submitCampaignForReview(db, ctx, await resolveCampaignId(data.campaign_id));
}

export async function handleManageCampaign(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.manage_campaign, input);
  const { db, ctx } = await context(meta);
  return manageCampaign(db, ctx, await resolveCampaignId(data.campaign_id), data.action, data.payload ?? {});
}

export async function handleGetCampaignAnalytics(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.get_campaign_analytics, input);
  const { db, ctx } = await context(meta);
  const [rooms, ads] = await Promise.all([
    campaignAnalytics(db, ctx, data.organization_id),
    import("./ads/analytics").then((m) => m.creativeAnalytics(db, ctx, data.organization_id)),
  ]);
  return { ...rooms, crawler_ads: ads };
}

export async function handleHideSponsoredPlacement(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.hide_sponsored_placement, input);
  const { db, ctx } = await context(meta);
  if (data.creative_id) {
    const { resolveCreativeId } = await import("./ads/creatives");
    const { markPlacementEvent } = await import("./ads/matching");
    await markPlacementEvent(db, ctx.subjectHash, await resolveCreativeId(data.creative_id), "hidden_at");
  }
  return hideCampaign(db, ctx.subjectHash, await resolveCampaignId(data.campaign_id));
}

export async function handleReportSponsoredPlacement(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.report_sponsored_placement, input);
  const { db, ctx } = await context(meta);
  if (data.creative_id) {
    const { resolveCreativeId } = await import("./ads/creatives");
    const { markPlacementEvent } = await import("./ads/matching");
    await markPlacementEvent(db, ctx.subjectHash, await resolveCreativeId(data.creative_id), "reported_at");
  }
  return reportCampaign(db, ctx.subjectHash, await resolveCampaignId(data.campaign_id), data.reason);
}


export async function handleAdminReviewCampaign(input: unknown, meta: McpMeta) {
  const data = parse(plusInputSchemas.admin_review_campaign, input);
  const { db, ctx } = await context(meta);
  const result = await adminReviewCampaign(
    db,
    ctx,
    await resolveCampaignId(data.campaign_id),
    data.action,
    data.reason,
  );
  return { ...result, message: `Kampagne: ${result.status}.` };
}


/* ------------------------------ Crawler Ads ------------------------------ */

const adSchemas = {
  add_campaign_creative: z
    .object({
      campaign_id: z.string().min(1),
      product_name: z.string().min(2).max(120),
      product_description: z.string().max(800).optional(),
      product_category: z.string().max(80).optional(),
      product_reference: z.string().max(120).optional(),
      headline: z.string().min(3).max(120),
      body: z.string().min(10).max(800),
      image_reference: z.string().max(300).optional(),
      image_alt: z.string().max(200).optional(),
      destination_url: z.string().url(),
      call_to_action: z.string().max(60).optional(),
      languages: z.array(z.string().max(8)).min(1).max(6).optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
    })
    .strict(),
  preview_sponsored_campaign: z.object({ campaign_id: z.string().min(1) }).strict(),
  set_resonance_ads_preference: z.object({ enabled: z.boolean() }).strict(),
  block_advertiser: z.object({ campaign_id: z.string().min(1) }).strict(),
};

export async function handleAddCampaignCreative(input: unknown, meta: McpMeta) {
  const data = parse(adSchemas.add_campaign_creative, input);
  const { db, ctx } = await context(meta);
  const { addCampaignCreative } = await import("./ads/creatives");
  return addCampaignCreative(db, ctx, {
    campaignId: await resolveCampaignId(data.campaign_id),
    productName: data.product_name,
    headline: data.headline,
    body: data.body,
    destinationUrl: data.destination_url,
    ...(data.product_description !== undefined ? { productDescription: data.product_description } : {}),
    ...(data.product_category !== undefined ? { productCategory: data.product_category } : {}),
    ...(data.product_reference !== undefined ? { productReference: data.product_reference } : {}),
    ...(data.image_reference !== undefined ? { imageReference: data.image_reference } : {}),
    ...(data.image_alt !== undefined ? { imageAlt: data.image_alt } : {}),
    ...(data.call_to_action !== undefined ? { callToAction: data.call_to_action } : {}),
    ...(data.languages !== undefined ? { languages: data.languages } : {}),
    ...(data.start_date !== undefined ? { startsAt: data.start_date } : {}),
    ...(data.end_date !== undefined ? { endsAt: data.end_date } : {}),
  });
}

export async function handlePreviewSponsoredCampaign(input: unknown, meta: McpMeta) {
  const data = parse(adSchemas.preview_sponsored_campaign, input);
  const { db, ctx } = await context(meta);
  const { previewCampaign } = await import("./ads/creatives");
  return previewCampaign(db, ctx, await resolveCampaignId(data.campaign_id));
}

export async function handleSetResonanceAdsPreference(input: unknown, meta: McpMeta) {
  const data = parse(adSchemas.set_resonance_ads_preference, input);
  const { db, ctx } = await context(meta);
  const { setResonanceAdsPreference } = await import("./ads/matching");
  return setResonanceAdsPreference(db, ctx.subjectHash, data.enabled);
}

export async function handleBlockAdvertiser(input: unknown, meta: McpMeta) {
  const data = parse(adSchemas.block_advertiser, input);
  const { db, ctx } = await context(meta);
  const campaignId = await resolveCampaignId(data.campaign_id);
  const { data: campaign } = await db
    .from("sponsored_campaigns")
    .select("organization_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) throw roomError("NOT_FOUND");
  const { blockAdvertiser } = await import("./ads/matching");
  return blockAdvertiser(db, ctx.subjectHash, (campaign as { organization_id: string }).organization_id);
}
