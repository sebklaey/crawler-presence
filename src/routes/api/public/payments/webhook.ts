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

async function handleSubscription(
  subscription: AnyRecord,
  env: PaddleEnv,
  forcedStatus?: string,
  occurredAt?: string | null,
  eventId?: string | null,
) {
  const shape = subscriptionShape(subscription);
  const ref = intentRefOf(subscription);
  const status = forcedStatus ?? shape.status;
  const plan = await planOf(subscription);

  // Durable mirror of provider state — upserted on the provider id, so retries
  // and out-of-order deliveries converge instead of duplicating.
  const { subscriptionFromEvent, mirrorSubscription } = await import("@/lib/billing-mirror.server");
  const mirrored = subscriptionFromEvent(subscription);
  if (mirrored) {
    const result = await mirrorSubscription(
      { ...mirrored, status: status ?? mirrored.status, plan },
      env,
      occurredAt ?? null,
      eventId ?? null,
    );
    // Superseded or refused deliveries must not touch downstream fulfilment:
    // a stale event is older than what we stored, and a rejected one cannot be
    // ordered safely at all. Neither may regress verified state.
    if (!result.applied) {
      console.log(
        "[crawler] subscription event not applied:",
        result.rejected ?? "stale",
        mirrored.subscriptionId,
      );
      return;
    }
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
        const { claimPaymentEvent, finishPaymentEvent, sanitizeErrorCode } =
          await import("@/lib/payment-events.server");
        const eventId = event.id ?? str(event.data["event_id"]);
        if (!eventId) {
          console.error("[crawler] payment event without id:", event.type);
          return new Response("Webhook error", { status: 400 });
        }
        // Ordering precondition: a subscription event without a usable
        // occurred_at can never be ordered against stored state. Reject it
        // BEFORE claiming, so it neither consumes an attempt nor mutates state.
        const { isValidOccurredAt } = await import("@/lib/billing-mirror.server");
        if (event.type.startsWith("subscription.") && !isValidOccurredAt(event.occurredAt)) {
          console.error("[crawler] subscription event without valid occurred_at:", event.type);
          return new Response("Missing occurred_at", { status: 400 });
        }

        const correlationId = `whk_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
        const claim = await claimPaymentEvent({
          eventId,
          eventType: event.type,
          environment: env,
          intentRef: intentRefOf(event.data),
          subscriptionId: str(event.data["subscription_id"]) ?? str(event.data["id"]),
          occurredAt: event.occurredAt,
          correlationId,
        });
        if (!claim.durable) {
          // Backend unavailable: fail loudly so Paddle retries instead of the
          // event being silently dropped.
          return new Response("Storage unavailable", { status: 503 });
        }
        if (!claim.claimed) {
          // processed / in_progress / exhausted are all deliberate, successful
          // no-ops: retrying them would duplicate work or never succeed.
          return Response.json({
            received: true,
            duplicate: true,
            outcome: claim.outcome,
            attempts: claim.attempts,
            correlation_id: correlationId,
          });
        }

        try {
          switch (event.type) {
            case "transaction.completed":
              await handleTransactionCompleted(event.data, env);
              break;
            case "subscription.created":
            case "subscription.updated":
            case "subscription.activated":
            case "subscription.resumed":
              await handleSubscription(event.data, env, undefined, event.occurredAt, eventId);
              break;
            case "subscription.canceled":
              await handleSubscription(event.data, env, "canceled", event.occurredAt, eventId);
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
          const finished = await finishPaymentEvent(eventId, claim.claimToken, undefined, correlationId);
          if (!finished.applied) {
            // We processed the event but could not record that fact against our
            // own lease (another worker reclaimed it, or storage is down). That
            // is an observable conflict, never a silent acknowledgement.
            console.error("[crawler] finalize conflict:", finished.reason, correlationId);
            return new Response("Finalize conflict", { status: 503 });
          }
          return Response.json({ received: true, correlation_id: correlationId });
        } catch (e) {
          // Only an allowlisted code is logged and persisted — never the raw
          // message, which can quote keys, tokens, emails or URLs.
          const code = sanitizeErrorCode(e);
          console.error("[crawler] payments webhook error:", correlationId, code);
          await finishPaymentEvent(eventId, claim.claimToken, e, correlationId);
          return new Response("Webhook error", { status: 500 });
        }
      },
    },
  },
});

