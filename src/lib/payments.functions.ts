/**
 * Payment server functions: checkout, billing portal and subscription state.
 *
 * The plan gate for publishing lives in `subscription.server.ts`; this module
 * only creates sessions and reads the caller's own subscription row.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRICE_BY_PLAN, type PlanId } from "@/lib/billing";

const envSchema = z.enum(["sandbox", "live"]);

const checkoutSchema = z.object({
  plan: z.enum(["plus", "pro", "business"]),
  returnUrl: z.string().url().max(600),
  environment: envSchema,
  sessionToken: z.string().trim().min(6).max(128).optional(),
});

export type CheckoutResult = { clientSecret: string } | { error: string };

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => checkoutSchema.parse(input))
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      const stripe = createStripeClient(data.environment);
      const priceId = PRICE_BY_PLAN[data.plan as PlanId];

      const prices = await stripe.prices.list({ lookup_keys: [priceId] });
      const stripePrice = prices.data[0];
      if (!stripePrice) throw new Error(`Price ${priceId} not found`);

      const {
        data: { user },
      } = await context.supabase.auth.getUser();
      const email = user?.email ?? undefined;
      const userId = context.userId;

      // userId is interpolated into a Stripe Search query — keep it opaque.
      if (!/^[a-zA-Z0-9_-]+$/.test(userId)) throw new Error("Invalid user id");

      let customerId: string | undefined;
      const found = await stripe.customers.search({
        query: `metadata['userId']:'${userId}'`,
        limit: 1,
      });
      if (found.data[0]) customerId = found.data[0].id;
      if (!customerId && email) {
        const existing = await stripe.customers.list({ email, limit: 1 });
        const match = existing.data[0];
        if (match) {
          if (match.metadata?.["userId"] !== userId) {
            await stripe.customers.update(match.id, { metadata: { ...match.metadata, userId } });
          }
          customerId = match.id;
        }
      }
      if (!customerId) {
        const created = await stripe.customers.create({
          ...(email ? { email } : {}),
          metadata: { userId },
        });
        customerId = created.id;
      }

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: "subscription",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        managed_payments: { enabled: true },
        metadata: {
          userId,
          plan: data.plan,
          managed_payments: "true",
          ...(data.sessionToken ? { draft_session: data.sessionToken } : {}),
        },
        subscription_data: { metadata: { userId, plan: data.plan } },
      } as Parameters<typeof stripe.checkout.sessions.create>[0]);

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

const portalSchema = z.object({
  returnUrl: z.string().url().max(600).optional(),
  environment: envSchema,
});

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => portalSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ url: string } | { error: string }> => {
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", context.userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const customerId = (sub as { stripe_customer_id?: string } | null)?.stripe_customer_id;
    if (!customerId) return { error: "No subscription found for this account yet." };

    try {
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        ...(data.returnUrl ? { return_url: data.returnUrl } : {}),
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export type SubscriptionState = {
  active: boolean;
  plan: PlanId | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  environment: "sandbox" | "live";
};

export const getMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ environment: envSchema }).parse(input))
  .handler(async ({ data, context }): Promise<SubscriptionState> => {
    const { data: row } = await context.supabase
      .from("subscriptions")
      .select("price_id, status, current_period_end, cancel_at_period_end")
      .eq("user_id", context.userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sub = row as
      | { price_id: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean }
      | null;

    if (!sub) {
      return {
        active: false,
        plan: null,
        status: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        environment: data.environment,
      };
    }

    const notExpired = !sub.current_period_end || Date.parse(sub.current_period_end) > Date.now();
    const active =
      (["active", "trialing", "past_due"].includes(sub.status) && notExpired) ||
      (sub.status === "canceled" && notExpired);

    const plan = (Object.entries(PRICE_BY_PLAN).find(([, price]) => price === sub.price_id)?.[0] ??
      null) as PlanId | null;

    return {
      active,
      plan,
      status: sub.status,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      environment: data.environment,
    };
  });
