/**
 * Payment webhook — the only place a subscription becomes real.
 *
 * Crawler has no user accounts, so nothing here refers to a person. Events are
 * matched to an anonymous publish intent (`pi_…`) that the checkout session
 * carried in its metadata, and to the presence that later redeemed it.
 */
import { createFileRoute } from "@tanstack/react-router";

import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

type AnySub = Record<string, any>;

const iso = (seconds?: number | null) => (seconds ? new Date(seconds * 1000).toISOString() : null);

function subscriptionShape(subscription: AnySub) {
  const item = subscription["items"]?.data?.[0];
  return {
    subscriptionId: String(subscription["id"] ?? ""),
    customerId: typeof subscription["customer"] === "string" ? subscription["customer"] : null,
    status: typeof subscription["status"] === "string" ? subscription["status"] : null,
    periodEnd: iso(item?.current_period_end ?? subscription["current_period_end"]),
  };
}

function intentRefOf(object: AnySub): string | null {
  const ref = object["metadata"]?.intent_ref;
  return typeof ref === "string" && /^pi_[a-f0-9]{32}$/.test(ref) ? ref : null;
}

async function handleSubscription(subscription: AnySub) {
  const { markIntentPaid } = await import("@/lib/intents.server");
  const { syncPresenceBilling } = await import("@/lib/mcp/presences");
  const shape = subscriptionShape(subscription);
  const ref = intentRefOf(subscription);

  if (ref) {
    await markIntentPaid(ref, {
      stripeCustomerId: shape.customerId,
      stripeSubscriptionId: shape.subscriptionId,
      subscriptionStatus: shape.status,
      currentPeriodEnd: shape.periodEnd,
    });
  } else {
    console.error("[crawler] subscription event without intent_ref metadata", shape.subscriptionId);
  }

  if (shape.subscriptionId) {
    await syncPresenceBilling(shape.subscriptionId, {
      subscriptionStatus: shape.status,
      currentPeriodEnd: shape.periodEnd,
    });
  }
}

async function handleCanceled(subscription: AnySub) {
  const { syncPresenceBilling } = await import("@/lib/mcp/presences");
  const shape = subscriptionShape(subscription);
  if (!shape.subscriptionId) return;
  await syncPresenceBilling(shape.subscriptionId, {
    subscriptionStatus: "canceled",
    currentPeriodEnd: shape.periodEnd,
  });
}

/** A completed checkout may arrive before the subscription events. */
async function handleCheckoutCompleted(session: AnySub) {
  const ref = intentRefOf(session);
  if (!ref) return;
  const { markIntentPaid } = await import("@/lib/intents.server");
  await markIntentPaid(ref, {
    stripeCustomerId: typeof session["customer"] === "string" ? session["customer"] : null,
    stripeSubscriptionId: typeof session["subscription"] === "string" ? session["subscription"] : null,
    subscriptionStatus: "active",
    currentPeriodEnd: null,
  });
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("[crawler] payments webhook with invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        const env: StripeEnv = rawEnv;
        try {
          const event = await verifyWebhook(request, env);
          switch (event.type) {
            case "checkout.session.completed":
              await handleCheckoutCompleted(event.data.object as AnySub);
              break;
            case "customer.subscription.created":
            case "customer.subscription.updated":
              await handleSubscription(event.data.object as AnySub);
              break;
            case "customer.subscription.deleted":
              await handleCanceled(event.data.object as AnySub);
              break;
            default:
              console.log("[crawler] unhandled payment event:", event.type);
          }
          return Response.json({ received: true });
        } catch (e) {
          console.error("[crawler] payments webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
