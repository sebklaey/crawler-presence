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
  mode: "demo" | "measured";
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
      /** Catalog entries stored but hidden because the plan limit is smaller. */
      hiddenCatalogEntries: number;
      catalogLimit: number;
      analytics: ManageAnalytics | null;
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
  const windowDays = Math.min(planById(asPlanId(plan)).analyticsDays, 90);

  try {
    const { hasEvents, publicSummary, detailedSummary } = await import("./mcp/presence-analytics");
    if (await hasEvents(slug)) {
      const period = (windowDays >= 90 ? 90 : 7) as 7 | 90;
      const summary = await publicSummary(slug, slug, period);
      const detail = await detailedSummary(slug, period);
      if (summary) {
        return {
          mode: "measured",
          windowDays: period,
          metrics: [
            {
              label: "Crawler conversations",
              value: summary.conversations_mentioning,
              hint: "Distinct anonymous Crawler sessions that mentioned this Presence",
            },
            { label: "Mention events", value: summary.mention_events, hint: "Crawler tool calls referencing it" },
            { label: "Public reads", value: summary.crawler_reads, hint: "Observable reads of your public files" },
            {
              label: "Outbound clicks",
              value: detail?.outbound_clicks ?? 0,
              hint: "Trackable clicks on your links",
            },
          ],
          topQuestions: (detail?.file_reads ?? []).slice(0, 4).map((f) => ({ label: f.path, count: f.count })),
          gaps: [],
        };
      }
    }
  } catch {
    /* fall through to the clearly labelled demo numbers */
  }

  const { demoDays, demoMissing, demoTopics, totals, windowRows } = await import("./demo-analytics");
  const rows = windowRows(demoDays(90), 7);
  const t = totals(rows);
  return {
    mode: "demo",
    windowDays: 7,
    metrics: [
      { label: "Crawler conversations", value: t.conversations, hint: "Interviews and questions inside Crawler" },
      { label: "Queries", value: t.queries, hint: "Individual questions asked about this Presence" },
      { label: "Entity appearances", value: t.appearances, hint: "Times your entity or products were surfaced" },
      { label: "Outbound clicks", value: t.outboundClicks, hint: "Trackable clicks on your links" },
      { label: "Crawler reads", value: t.crawlerReads, hint: "Observable reads of your public files" },
    ],
    topQuestions: demoTopics.slice(0, 4).map((topic) => ({ label: topic.label, count: topic.count })),
    gaps: demoMissing.slice(0, 3),
  };
}

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
