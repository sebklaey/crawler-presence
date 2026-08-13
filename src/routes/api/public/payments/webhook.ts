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

async function handleTransactionCompleted(transaction: AnyRecord, env: PaddleEnv) {
  const customerId = str(transaction["customer_id"]);
  if (customerId) {
    const { mirrorCustomer } = await import("@/lib/billing-mirror.server");
    await mirrorCustomer({ id: customerId }, env);
  }
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

async function handleSubscription(subscription: AnyRecord, env: PaddleEnv, forcedStatus?: string) {
  const shape = subscriptionShape(subscription);
  const ref = intentRefOf(subscription);
  const status = forcedStatus ?? shape.status;
  const plan = await planOf(subscription);

  // Durable mirror of provider state — upserted on the provider id, so retries
  // and out-of-order deliveries converge instead of duplicating.
  const { subscriptionFromEvent, mirrorSubscription } = await import("@/lib/billing-mirror.server");
  const mirrored = subscriptionFromEvent(subscription);
  if (mirrored) {
    await mirrorSubscription({ ...mirrored, status, plan }, env);
  }

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

        // Defence in depth: only Paddle's published addresses may deliver here.
        const { isPaddleRequest, callerIp } = await import("@/lib/paddle-ips.server");
        if (!(await isPaddleRequest(request))) {
          console.error("[crawler] payments webhook from non-Paddle IP:", callerIp(request));
          return new Response("Forbidden", { status: 403 });
        }


        let event: Awaited<ReturnType<typeof verifyWebhook>>;
        try {
          event = await verifyWebhook(request, env);
        } catch (e) {
          console.error("[crawler] payments webhook verification failed:", e);
          return new Response("Webhook error", { status: 400 });
        }

        // Idempotency: claim the event id before doing any work. A retry or a
        // replay of the same event must never publish or charge twice.
        const { claimPaymentEvent, finishPaymentEvent } = await import("@/lib/payment-events.server");
        const eventId = event.id ?? str(event.data["event_id"]);
        if (!eventId) {
          console.error("[crawler] payment event without id:", event.type);
          return new Response("Webhook error", { status: 400 });
        }
        const claim = await claimPaymentEvent({
          eventId,
          eventType: event.type,
          environment: env,
          intentRef: intentRefOf(event.data),
          subscriptionId: str(event.data["subscription_id"]) ?? str(event.data["id"]),
          occurredAt: event.occurredAt,
        });
        if (!claim.durable) {
          // Backend unavailable: fail loudly so Paddle retries instead of the
          // event being silently dropped.
          return new Response("Storage unavailable", { status: 503 });
        }
        if (!claim.claimed) return Response.json({ received: true, duplicate: true });

        try {
          switch (event.type) {
            case "transaction.completed":
              await handleTransactionCompleted(event.data, env);
              break;
            case "subscription.created":
            case "subscription.updated":
            case "subscription.activated":
            case "subscription.resumed":
              await handleSubscription(event.data, env);
              break;
            case "subscription.canceled":
              await handleSubscription(event.data, env, "canceled");
              break;
            case "customer.created":
            case "customer.updated": {
              const { mirrorCustomer } = await import("@/lib/billing-mirror.server");
              await mirrorCustomer(event.data, env);
              break;
            }
            case "transaction.payment_failed":
              // A failed payment never publishes; the intent simply stays unpaid.
              console.log("[crawler] payment failed for intent:", intentRefOf(event.data));
              break;
            default:
              console.log("[crawler] unhandled payment event:", event.type);
          }
          await finishPaymentEvent(eventId);
          return Response.json({ received: true });
        } catch (e) {
          console.error("[crawler] payments webhook error:", e);
          await finishPaymentEvent(eventId, e);
          return new Response("Webhook error", { status: 500 });
        }
      },
    },
  },
});

