/**
 * Accountless Presence management.
 *
 * There is no login. Whoever holds the recovery code (`<slug>~<secret>`)
 * controls the Presence: read its status, take it offline, put it back online,
 * rotate the secret and open the payment provider's billing portal. Crawler
 * stores only a SHA-256 hash of the secret, so a lost code cannot be recovered
 * by anyone — including Crawler.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const codeSchema = z.object({ code: z.string().trim().min(10).max(200) });

export type ManageAnalytics = {
  /** "measured" once real events exist, "empty" before the first event. */
  mode: "measured" | "empty";
  windowDays: number;
  metrics: { label: string; value: number; hint: string }[];
  topQuestions: { label: string; count: number }[];
  gaps: string[];
};

export type ManageOverview =
  | { ok: false; reason: "invalid-code" | "not-found" | "rate-limited" | "unavailable" }
  | {
      ok: true;
      slug: string;
      name: string;
      plan: string;
      mode: "live" | "demo";
      status: "live" | "offline";
      publishedAt: string;
      subscriptionStatus: string | null;
      currentPeriodEnd: string | null;
      billingPortalAvailable: boolean;
      secretUpdatedAt: string | null;
      paths: string[];
      /** Billing lapsed: still public, but analytics and editing are locked. */
      restricted: boolean;
      /** Content records stored but hidden because the plan limit is smaller. */
      hiddenCatalogEntries: number;
      catalogLimit: number;
      analytics: ManageAnalytics | null;
      customDomain: CustomDomainState;
      apiAccess: boolean;
      /** Canonical domain AI systems can use with the CrawlMe API. */
      entityDomain: string | null;
      version: number;
      updatedAt: string;

    };


type ResolveError = { error: "invalid-code" | "not-found" | "rate-limited" | "unavailable" };

/**
 * Capability check. Any database failure resolves to "unavailable" — never to
 * a silent success or an in-memory guess.
 */
async function resolve(code: string) {
  const { parseRecoveryCode, verifyManageSecret, allowRequest, PresenceStoreError } = await import(
    "./mcp/presences"
  );
  const parsed = parseRecoveryCode(code);
  if (!parsed) return { error: "invalid-code" } as ResolveError;
  try {
    if (!(await allowRequest(`manage:${parsed.slug}`, 20))) return { error: "rate-limited" } as ResolveError;
    const presence = await verifyManageSecret(parsed.slug, parsed.secret);
    if (!presence) return { error: "not-found" } as ResolveError;
    return { presence, slug: parsed.slug };
  } catch (error) {
    if (error instanceof PresenceStoreError) return { error: "unavailable" } as ResolveError;
    throw error;
  }
}

/**
 * Measurable Presence analytics only: Crawler-internal conversations/queries,
 * entity appearances, trackable outbound clicks and observable crawler reads
 * of the published files. This build serves seeded DEMO numbers and says so.
 * Crawler never sees private ChatGPT, Claude or Gemini conversations.
 */
async function analyticsFor(slug: string, plan: string): Promise<ManageAnalytics> {
  const { planById } = await import("./billing");
  const { asPlanId } = await import("./entitlements");
  const allowed = planById(asPlanId(plan)).analyticsDays;
  const period = (allowed >= 90 ? 90 : 7) as 7 | 90;

  const { publicSummary, detailedSummary } = await import("./mcp/presence-analytics");
  const [summary, detail] = await Promise.all([publicSummary(slug, slug, period), detailedSummary(slug, period)]);

  const metrics = [
    {
      label: "Crawler conversations",
      value: summary?.conversations_mentioning ?? 0,
      hint: "Distinct anonymous Crawler sessions that mentioned this Presence",
    },
    {
      label: "Mention events",
      value: summary?.mention_events ?? 0,
      hint: "Crawler tool calls referencing this Presence",
    },
    {
      label: "Public reads",
      value: summary?.crawler_reads ?? 0,
      hint: "Observable reads of your public files and Presence page",
    },
    {
      label: "Outbound clicks",
      value: detail?.outbound_clicks ?? 0,
      hint: "Trackable clicks on your links",
    },
  ];

  const measured = metrics.some((m) => m.value > 0);

  return {
    mode: measured ? "measured" : "empty",
    windowDays: period,
    metrics,
    topQuestions: (detail?.file_reads ?? []).slice(0, 6).map((f) => ({ label: f.path, count: f.count })),
    gaps: [],
  };
}

export type PresenceAnalyticsResult =
  | { ok: false; reason: "invalid-code" | "not-found" | "rate-limited" | "unavailable" }
  | {
      ok: true;
      slug: string;
      name: string;
      plan: string;
      windowDays: number;
      maxWindowDays: number;
      measured: boolean;
      totals: {
        conversations: number;
        mentions: number;
        reads: number;
        outboundClicks: number;
      };
      daily: { date: string; mentions: number; reads: number; clicks: number }[];
      fileReads: { path: string; count: number }[];
      sources: { source: string; count: number }[];
      dataSince: string | null;
      privacyNote: string;
    };

const analyticsSchema = codeSchema.extend({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(7) });

/**
 * Measured Presence analytics for the /analytics page. Capability-based: the
 * recovery code is the only key. Everything returned was actually observed
 * inside Crawler — there is no seeded or demo data anywhere in this path.
 */
export const presenceAnalyticsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => analyticsSchema.parse(input))
  .handler(async ({ data }): Promise<PresenceAnalyticsResult> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const p = resolved.presence;

    const { planById } = await import("./billing");
    const { asPlanId } = await import("./entitlements");
    const maxWindowDays = planById(asPlanId(p.plan)).analyticsDays >= 90 ? 90 : 7;
    const period = Math.min(data.days, maxWindowDays) as 7 | 30 | 90;

    const { publicSummary, detailedSummary, PRIVACY_NOTE } = await import("./mcp/presence-analytics");
    const [summary, detail] = await Promise.all([
      publicSummary(p.slug, p.core?.name || p.slug, period),
      detailedSummary(p.slug, period),
    ]);
    if (!summary || !detail) return { ok: false, reason: "unavailable" };

    const totals = {
      conversations: summary.conversations_mentioning,
      mentions: summary.mention_events,
      reads: summary.crawler_reads,
      outboundClicks: detail.outbound_clicks,
    };

    return {
      ok: true,
      slug: p.slug,
      name: p.core?.name || p.slug,
      plan: p.plan,
      windowDays: period,
      maxWindowDays,
      measured: Object.values(totals).some((value) => value > 0),
      totals,
      daily: detail.daily,
      fileReads: detail.file_reads,
      sources: detail.sources,
      dataSince: summary.data_since,
      privacyNote: PRIVACY_NOTE,
    };
  });

export const manageOverviewFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => codeSchema.parse(input))
  .handler(async ({ data }): Promise<ManageOverview> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const p = resolved.presence;
    const { applyCatalogLimit, isRestricted } = await import("./entitlements");
    const limited = applyCatalogLimit(p.core, p.plan);
    const restricted = isRestricted(p.subscriptionStatus, p.mode);
    return {
      ok: true,
      slug: p.slug,
      name: p.core?.name || p.slug,
      plan: p.plan,
      mode: p.mode,
      status: p.status,
      publishedAt: p.publishedAt,
      subscriptionStatus: p.subscriptionStatus,
      currentPeriodEnd: p.currentPeriodEnd,
      billingPortalAvailable: Boolean(p.billingCustomerId),
      secretUpdatedAt: p.manageSecretUpdatedAt,
      paths: p.files.map((f) => f.path),
      restricted,
      hiddenCatalogEntries: limited.hidden,
      catalogLimit: limited.limit,
      // Analytics are part of the paid plan — locked while billing has lapsed.
      analytics: restricted ? null : await analyticsFor(p.slug, p.plan),
      customDomain: {
        domain: p.customDomain,
        verified: Boolean(p.customDomainVerifiedAt),
        verifiedAt: p.customDomainVerifiedAt,
        allowedOnPlan: DOMAIN_PLANS.includes(p.plan),
        instructions: p.customDomain
          ? {
              txtHost: CUSTOM_DOMAIN_TXT_HOST,
              txtValue: p.customDomainToken,
              cnameTarget: CUSTOM_DOMAIN_TARGET,
            }
          : null,
      },
      apiAccess: p.plan === "business",
      entityDomain: (() => {
        const website = p.core?.website ?? "";
        try {
          return website ? new URL(website.includes("://") ? website : `https://${website}`).hostname.replace(/^www\./, "") : null;
        } catch {
          return null;
        }
      })(),
      version: p.version,
      updatedAt: p.updatedAt,
    };


  });

const statusSchema = codeSchema.extend({ status: z.enum(["live", "offline"]) });

export const manageSetStatusFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => statusSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; status?: "live" | "offline"; reason?: string }> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const { setPresenceStatus, PresenceStoreError } = await import("./mcp/presences");
    try {
      await setPresenceStatus(resolved.slug, data.status);
    } catch (error) {
      if (error instanceof PresenceStoreError) return { ok: false, reason: "unavailable" };
      throw error;
    }
    return { ok: true, status: data.status };
  });

export const manageRotateSecretFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => codeSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; recoveryCode?: string; reason?: string }> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const { rotateManageSecret, recoveryCode, PresenceStoreError } = await import("./mcp/presences");
    try {
      const secret = await rotateManageSecret(resolved.slug);
      return { ok: true, recoveryCode: recoveryCode(resolved.slug, secret) };
    } catch (error) {
      if (error instanceof PresenceStoreError) return { ok: false, reason: "unavailable" };
      throw error;
    }
  });

const portalSchema = codeSchema.extend({ returnUrl: z.string().url().max(600).optional() });

export const manageBillingPortalFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => portalSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; url?: string; reason?: string }> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const customerId = resolved.presence.billingCustomerId;
    if (!customerId) return { ok: false, reason: "no-subscription" };

    const { createPortalUrl, getPaddleErrorMessage } = await import("./paddle.server");
    try {
      const url = await createPortalUrl(customerId, resolved.presence.billingSubscriptionId);
      return { ok: true, url };
    } catch (error) {
      return { ok: false, reason: getPaddleErrorMessage(error) };
    }
  });

/* ------------------------------------------------------------------ */
/* Custom domain (Pro and Business)                                    */
/* ------------------------------------------------------------------ */

/** Plans that may attach a custom domain. */
const DOMAIN_PLANS = ["pro", "business"];

export const CUSTOM_DOMAIN_TARGET = "crawler.today";
export const CUSTOM_DOMAIN_TXT_HOST = "_crawler";

export type CustomDomainState = {
  domain: string | null;
  verified: boolean;
  verifiedAt: string | null;
  /** DNS records the user has to create. */
  instructions: { txtHost: string; txtValue: string | null; cnameTarget: string } | null;
  allowedOnPlan: boolean;
};

const domainSchema = codeSchema.extend({ domain: z.string().trim().min(4).max(253) });

/** Looks up the verification TXT record over DNS-over-HTTPS. */
async function txtRecords(name: string): Promise<string[]> {
  const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`, {
    headers: { accept: "application/dns-json" },
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as { Answer?: { data?: string }[] };
  return (payload.Answer ?? []).map((a) => (a.data ?? "").replace(/^"|"$/g, "").trim()).filter(Boolean);
}

export const manageSetDomainFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => domainSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; state?: CustomDomainState; reason?: string }> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    if (!DOMAIN_PLANS.includes(resolved.presence.plan)) return { ok: false, reason: "plan" };

    const { normalizeDomain, setCustomDomain, PresenceStoreError } = await import("./mcp/presences");
    const domain = normalizeDomain(data.domain);
    if (!domain) return { ok: false, reason: "invalid-domain" };
    try {
      const token = await setCustomDomain(resolved.slug, domain);
      return {
        ok: true,
        state: {
          domain,
          verified: false,
          verifiedAt: null,
          allowedOnPlan: true,
          instructions: { txtHost: CUSTOM_DOMAIN_TXT_HOST, txtValue: token, cnameTarget: CUSTOM_DOMAIN_TARGET },
        },
      };
    } catch (error) {
      if (error instanceof PresenceStoreError) return { ok: false, reason: "unavailable" };
      return { ok: false, reason: "domain-taken" };
    }
  });

export const manageVerifyDomainFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => codeSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; verified?: boolean; reason?: string }> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const { customDomain, customDomainToken } = resolved.presence;
    if (!customDomain || !customDomainToken) return { ok: false, reason: "no-domain" };

    const found = await txtRecords(`${CUSTOM_DOMAIN_TXT_HOST}.${customDomain}`);
    if (!found.includes(customDomainToken)) return { ok: true, verified: false, reason: "txt-missing" };

    const { markCustomDomainVerified, PresenceStoreError } = await import("./mcp/presences");
    try {
      await markCustomDomainVerified(resolved.slug);
    } catch (error) {
      if (error instanceof PresenceStoreError) return { ok: false, reason: "unavailable" };
      throw error;
    }
    return { ok: true, verified: true };
  });

export const manageRemoveDomainFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => codeSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const { clearCustomDomain, PresenceStoreError } = await import("./mcp/presences");
    try {
      await clearCustomDomain(resolved.slug);
    } catch (error) {
      if (error instanceof PresenceStoreError) return { ok: false, reason: "unavailable" };
      throw error;
    }
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Restore the full Knowledge Core into the browser workspace          */
/* ------------------------------------------------------------------ */

export type ManageRestoreResult =
  | { ok: false; reason: "invalid-code" | "not-found" | "rate-limited" | "unavailable" }
  | {
      ok: true;
      slug: string;
      plan: string;
      publishedAt: string;
      core: import("./knowledge").KnowledgeCore;
    };

/**
 * Returns the stored Knowledge Core for a Presence so /knowledge, /preview and
 * /publish can show the owner's real data after the recovery code was entered.
 * Capability-based: the recovery code is the only key.
 */
export const manageRestoreCoreFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => codeSchema.parse(input))
  .handler(async ({ data }): Promise<ManageRestoreResult> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const p = resolved.presence;
    return { ok: true, slug: p.slug, plan: p.plan, publishedAt: p.publishedAt, core: p.core };
  });
