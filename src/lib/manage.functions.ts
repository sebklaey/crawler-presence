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
  mode: "demo";
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
async function analyticsFor(): Promise<ManageAnalytics> {
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
      analytics: await analyticsFor(),
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
