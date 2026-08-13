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
 * Step 1 of publishing. Crawler Alpha 0.0.2 is paid-only: this creates an
 * anonymous publish intent and a hosted checkout session — no Crawler account
 * is created and no personal identifier is sent to the payment provider.
 * Without working payment credentials nothing is published (no free fallback).
 */
export const startPublishFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => startSchema.parse(input))
  .handler(async ({ data }): Promise<StartPublishResult> => {
    const { billingEnvironment, createIntent, attachCheckout } = await import("./intents.server");
    const { paymentsConfigured } = await import("./paddle.server");
    const environment = billingEnvironment();

    if (!paymentsConfigured(environment)) {
      return {
        kind: "error",
        message: "Checkout is temporarily unavailable. Publishing requires an active paid subscription — please try again shortly.",
      };
    }


    const intent = await createIntent({
      plan: data.plan,
      status: "pending",
      ...(data.sessionToken ? { sessionToken: data.sessionToken } : {}),
    });
    if (!intent) return { kind: "error", message: "Could not start checkout. Please try again." };

    const { createHostedCheckout, getPaddleErrorMessage } = await import("./paddle.server");
    try {
      const checkout = await createHostedCheckout({ plan: data.plan, intentRef: intent.intentRef });
      await attachCheckout(intent.intentRef, checkout.transactionId);
      return { kind: "checkout", url: checkout.url, intentRef: intent.intentRef };
    } catch (error) {
      return { kind: "error", message: getPaddleErrorMessage(error) };
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
        billingCustomerId: intent.billingCustomerId,
        billingSubscriptionId: intent.billingSubscriptionId,
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

    // Measured, observable read of the public Presence page.
    try {
      const { recordEvent } = await import("./mcp/presence-analytics");
      await recordEvent({ slug: record.slug, eventType: "file_read", source: "web", filePath: "(presence page)" });
    } catch {
      /* measurement must never break public delivery */
    }

    return {
      found: true as const,
      slug: record.slug,
      mode: record.mode,
      plan: record.plan,
      publishedAt: record.publishedAt,
      name: record.core?.name ?? "",
      tagline: record.core?.tagline ?? "",
      summary: record.core?.summary ?? "",
      website: record.core?.website ?? null,
      links: (record.core?.links ?? []).slice(0, 8),
      files: record.files.map((f) => ({ path: f.path, type: f.type })),
    };

  });
