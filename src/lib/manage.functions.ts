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

export type ManageOverview =
  | { ok: false; reason: "invalid-code" | "not-found" | "rate-limited" }
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
    };

async function resolve(code: string) {
  const { parseRecoveryCode, verifyManageSecret, allowRequest } = await import("./mcp/presences");
  const parsed = parseRecoveryCode(code);
  if (!parsed) return { error: "invalid-code" as const };
  if (!(await allowRequest(`manage:${parsed.slug}`, 20))) return { error: "rate-limited" as const };
  const presence = await verifyManageSecret(parsed.slug, parsed.secret);
  if (!presence) return { error: "not-found" as const };
  return { presence, slug: parsed.slug };
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
      billingPortalAvailable: Boolean(p.stripeCustomerId),
      secretUpdatedAt: p.manageSecretUpdatedAt,
      paths: p.files.map((f) => f.path),
    };
  });

const statusSchema = codeSchema.extend({ status: z.enum(["live", "offline"]) });

export const manageSetStatusFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => statusSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; status?: "live" | "offline"; reason?: string }> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const { setPresenceStatus } = await import("./mcp/presences");
    await setPresenceStatus(resolved.slug, data.status);
    return { ok: true, status: data.status };
  });

export const manageRotateSecretFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => codeSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; recoveryCode?: string; reason?: string }> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const { rotateManageSecret, recoveryCode } = await import("./mcp/presences");
    const secret = await rotateManageSecret(resolved.slug);
    return { ok: true, recoveryCode: recoveryCode(resolved.slug, secret) };
  });

const portalSchema = codeSchema.extend({ returnUrl: z.string().url().max(600).optional() });

export const manageBillingPortalFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => portalSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; url?: string; reason?: string }> => {
    const resolved = await resolve(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const customerId = resolved.presence.stripeCustomerId;
    if (!customerId) return { ok: false, reason: "no-subscription" };

    const { billingEnvironment } = await import("./intents.server");
    const { createStripeClient, getStripeErrorMessage } = await import("./stripe.server");
    try {
      const stripe = createStripeClient(billingEnvironment());
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        ...(data.returnUrl ? { return_url: data.returnUrl } : {}),
      });
      return { ok: true, url: portal.url };
    } catch (error) {
      return { ok: false, reason: getStripeErrorMessage(error) };
    }
  });
