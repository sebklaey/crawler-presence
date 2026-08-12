import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { KnowledgeCore } from "./knowledge";

const tokenSchema = z.object({ token: z.string().trim().min(6).max(128) });

/** Recover an anonymous MCP/web draft by its opaque token. */
export const loadDraft = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { getSession } = await import("./mcp/sessions");
    const session = await getSession(data.token);
    if (!session) return { found: false as const };
    return {
      found: true as const,
      core: session.core,
      updated_at: new Date(session.updatedAt).toISOString(),
    };
  });

/* ------------------------------------------------------------------ */
/* Publishing — accountless, capability-based                          */
/* ------------------------------------------------------------------ */

const originSchema = z
  .string()
  .url()
  .max(300)
  .refine((value) => {
    try {
      const url = new URL(value);
      if (url.protocol === "http:" && url.hostname === "localhost") return true;
      if (url.protocol !== "https:") return false;
      return (
        url.hostname === "crawler.today" ||
        url.hostname === "www.crawler.today" ||
        url.hostname.endsWith(".lovable.app")
      );
    } catch {
      return false;
    }
  }, "Unsupported origin");

const startSchema = z.object({
  core: z.unknown(),
  plan: z.enum(["plus", "pro", "business"]),
  origin: originSchema,
  sessionToken: z.string().trim().min(6).max(128).optional(),
});

export type StartPublishResult =
  | { kind: "checkout"; url: string; intentRef: string }
  | {
      kind: "demo";
      slug: string;
      publishedAt: string;
      paths: string[];
      manageSecret: string;
      recoveryCode: string;
    }
  | { kind: "error"; message: string };

/**
 * Step 1 of publishing. With payment credentials this creates an anonymous
 * publish intent and a hosted checkout session — no Crawler account is created
 * and no personal identifier is sent to the payment provider by Crawler.
 * Without credentials the very same flow runs in clearly labelled DEMO mode.
 */
export const startPublishFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => startSchema.parse(input))
  .handler(async ({ data }): Promise<StartPublishResult> => {
    const { billingEnvironment, createIntent, attachCheckout } = await import("./intents.server");
    const { paymentsConfigured } = await import("./stripe.server");
    const { publishDraft, recoveryCode } = await import("./mcp/presences");
    const environment = billingEnvironment();

    if (!paymentsConfigured(environment)) {
      const intent = await createIntent({
        plan: data.plan,
        status: "demo",
        ...(data.sessionToken ? { sessionToken: data.sessionToken } : {}),
      });
      const { presence, manageSecret } = await publishDraft({
        core: data.core as KnowledgeCore,
        plan: data.plan,
        mode: "demo",
        ...(data.sessionToken ? { sessionToken: data.sessionToken } : {}),
        ...(intent ? { intentRef: intent.intentRef } : {}),
      });
      if (intent) {
        const { markIntentPublished } = await import("./intents.server");
        await markIntentPublished(intent.intentRef, presence.slug);
      }
      return {
        kind: "demo",
        slug: presence.slug,
        publishedAt: presence.publishedAt,
        paths: presence.files.map((f) => f.path),
        manageSecret,
        recoveryCode: recoveryCode(presence.slug, manageSecret),
      };
    }

    const intent = await createIntent({
      plan: data.plan,
      status: "pending",
      ...(data.sessionToken ? { sessionToken: data.sessionToken } : {}),
    });
    if (!intent) return { kind: "error", message: "Could not start checkout. Please try again." };

    const { createStripeClient, getStripeErrorMessage } = await import("./stripe.server");
    const { PRICE_BY_PLAN } = await import("./billing");
    try {
      const stripe = createStripeClient(environment);
      const prices = await stripe.prices.list({ lookup_keys: [PRICE_BY_PLAN[data.plan]] });
      const price = prices.data[0];
      if (!price) throw new Error(`Price ${PRICE_BY_PLAN[data.plan]} is not configured`);

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: price.id, quantity: 1 }],
        mode: "subscription",
        success_url: `${data.origin}/publish?intent=${intent.intentRef}`,
        cancel_url: `${data.origin}/publish?canceled=1`,
        managed_payments: { enabled: true },
        // Only the anonymous intent reference travels with the payment.
        metadata: { intent_ref: intent.intentRef, plan: data.plan, managed_payments: "true" },
        subscription_data: { metadata: { intent_ref: intent.intentRef, plan: data.plan } },
      } as Parameters<typeof stripe.checkout.sessions.create>[0]);

      if (!session.url) throw new Error("Checkout session has no URL");
      await attachCheckout(intent.intentRef, session.id);
      return { kind: "checkout", url: session.url, intentRef: intent.intentRef };
    } catch (error) {
      return { kind: "error", message: getStripeErrorMessage(error) };
    }
  });

const finalizeSchema = z.object({
  intentRef: z.string().trim().regex(/^pi_[a-f0-9]{32}$/),
  core: z.unknown().optional(),
});

export type FinalizeResult =
  | { kind: "pending" }
  | { kind: "expired" }
  | { kind: "already"; slug: string }
  | {
      kind: "published";
      slug: string;
      mode: "live" | "demo";
      plan: string;
      publishedAt: string;
      paths: string[];
      manageSecret: string;
      recoveryCode: string;
    };

/**
 * Step 2 of publishing. Redeems a paid intent exactly once: the Presence goes
 * live and the management secret is returned here and nowhere else. Crawler
 * stores only its hash, so this response can never be reproduced.
 */
export const finalizePublishFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => finalizeSchema.parse(input))
  .handler(async ({ data }): Promise<FinalizeResult> => {
    const { getIntent, markIntentPublished } = await import("./intents.server");
    const intent = await getIntent(data.intentRef);
    if (!intent) return { kind: "expired" };
    if (intent.presenceSlug) return { kind: "already", slug: intent.presenceSlug };
    if (intent.status !== "paid") return { kind: "pending" };

    let core = data.core as KnowledgeCore | undefined;
    if (!core && intent.sessionToken) {
      const { getSession } = await import("./mcp/sessions");
      core = (await getSession(intent.sessionToken))?.core;
    }
    if (!core) return { kind: "expired" };

    const { publishDraft, recoveryCode } = await import("./mcp/presences");
    const { presence, manageSecret } = await publishDraft({
      core,
      plan: intent.plan,
      mode: "live",
      ...(intent.sessionToken ? { sessionToken: intent.sessionToken } : {}),
      intentRef: intent.intentRef,
      billing: {
        stripeCustomerId: intent.stripeCustomerId,
        stripeSubscriptionId: intent.stripeSubscriptionId,
        subscriptionStatus: intent.subscriptionStatus,
        currentPeriodEnd: intent.currentPeriodEnd,
      },
    });
    await markIntentPublished(intent.intentRef, presence.slug);

    return {
      kind: "published",
      slug: presence.slug,
      mode: presence.mode,
      plan: presence.plan,
      publishedAt: presence.publishedAt,
      paths: presence.files.map((f) => f.path),
      manageSecret,
      recoveryCode: recoveryCode(presence.slug, manageSecret),
    };
  });

const slugSchema = z.object({ slug: z.string().trim().regex(/^[a-z0-9-]{1,120}$/) });

/** Public read of a published presence (files + core), used by the public page. */
export const getPublishedFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => slugSchema.parse(input))
  .handler(async ({ data }) => {
    const { getLivePresence } = await import("./mcp/presences");
    const record = await getLivePresence(data.slug);
    if (!record) return { found: false as const };
    return {
      found: true as const,
      slug: record.slug,
      mode: record.mode,
      plan: record.plan,
      publishedAt: record.publishedAt,
      name: record.core?.name ?? "",
      tagline: record.core?.tagline ?? "",
      summary: record.core?.summary ?? "",
      files: record.files.map((f) => ({ path: f.path, type: f.type })),
    };
  });
