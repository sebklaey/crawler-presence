/**
 * Paddle webhook — the only place a subscription becomes real.
 *
 * Crawler has no user accounts, so nothing here refers to a person. Events are
 * matched to an anonymous publish intent (`pi_…`) that the transaction carried
 * in its `custom_data`, and to the presence that later redeemed it.
 */
import { createFileRoute } from "@tanstack/react-router";

import { type PaddleEnv, verifyWebhook } from "@/lib/paddle.server";

type AnyRecord = Record<string, any>;

function intentRefOf(object: AnyRecord): string | null {
  const ref = object["custom_data"]?.intent_ref;
  return typeof ref === "string" && /^pi_[a-f0-9]{32}$/.test(ref) ? ref : null;
}

const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

async function handleTransactionCompleted(transaction: AnyRecord) {
  const ref = intentRefOf(transaction);
  if (!ref) {
    console.error("[crawler] transaction without intent_ref custom_data", str(transaction["id"]));
    return;
  }
  const { markIntentPaid } = await import("@/lib/intents.server");
  await markIntentPaid(ref, {
    billingCustomerId: str(transaction["customer_id"]),
    billingSubscriptionId: str(transaction["subscription_id"]),
    subscriptionStatus: "active",
    currentPeriodEnd: str(transaction["billing_period"]?.ends_at),
  });
}

function subscriptionShape(subscription: AnyRecord) {
  return {
    subscriptionId: str(subscription["id"]),
    customerId: str(subscription["customer_id"]),
    status: str(subscription["status"]),
    periodEnd: str(subscription["current_billing_period"]?.ends_at),
  };
}

/** Upgrades and downgrades arrive as a changed price on the subscription. */
async function planOf(subscription: AnyRecord): Promise<string | null> {
  const items = Array.isArray(subscription["items"]) ? (subscription["items"] as AnyRecord[]) : [];
  const externalId = str(items[0]?.["price"]?.import_meta?.external_id);
  const { planFromPriceExternalId } = await import("@/lib/entitlements");
  return planFromPriceExternalId(externalId);
}

async function handleSubscription(subscription: AnyRecord, forcedStatus?: string) {
  const shape = subscriptionShape(subscription);
  const ref = intentRefOf(subscription);
  const status = forcedStatus ?? shape.status;
  const plan = await planOf(subscription);

  if (ref) {
    const { markIntentPaid } = await import("@/lib/intents.server");
    await markIntentPaid(ref, {
      billingCustomerId: shape.customerId,
      billingSubscriptionId: shape.subscriptionId,
      subscriptionStatus: status,
      currentPeriodEnd: shape.periodEnd,
    });
  }

  if (shape.subscriptionId) {
    const { syncPresenceBilling } = await import("@/lib/mcp/presences");
    await syncPresenceBilling(shape.subscriptionId, {
      subscriptionStatus: status,
      currentPeriodEnd: shape.periodEnd,
      // Plan changes apply immediately; cancellation never changes the plan.
      plan: forcedStatus === "canceled" ? null : plan,
    });
  }
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
        const env: PaddleEnv = rawEnv;
        try {
          const event = await verifyWebhook(request, env);
          switch (event.type) {
            case "transaction.completed":
              await handleTransactionCompleted(event.data);
              break;
            case "subscription.created":
            case "subscription.updated":
            case "subscription.activated":
　            case "subscription.resumed":
              await handleSubscription(event.data);
              break;
            case "subscription.canceled":
              await handleSubscription(event.data, "canceled");
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
