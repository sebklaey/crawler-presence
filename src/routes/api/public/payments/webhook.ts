import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _supabase;
}

type AnySub = Record<string, any>;

function priceOf(subscription: AnySub) {
  const item = subscription["items"]?.data?.[0];
  return {
    priceId: item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id,
    productId: item?.price?.product,
    periodStart: item?.current_period_start ?? subscription["current_period_start"],
    periodEnd: item?.current_period_end ?? subscription["current_period_end"],
  };
}

const iso = (seconds?: number | null) => (seconds ? new Date(seconds * 1000).toISOString() : null);

async function upsertSubscription(subscription: AnySub, env: StripeEnv) {
  const userId = subscription["metadata"]?.userId;
  if (!userId) {
    console.error("[crawler] subscription webhook without userId metadata", subscription["id"]);
    return;
  }
  const { priceId, productId, periodStart, periodEnd } = priceOf(subscription);

  await getSupabase()
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_subscription_id: subscription["id"],
        stripe_customer_id: subscription["customer"],
        product_id: productId ?? "unknown",
        price_id: priceId ?? "unknown",
        status: subscription["status"],
        current_period_start: iso(periodStart),
        current_period_end: iso(periodEnd),
        cancel_at_period_end: Boolean(subscription["cancel_at_period_end"]),
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );
}

async function markCanceled(subscription: AnySub, env: StripeEnv) {
  await getSupabase()
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription["id"])
    .eq("environment", env);
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
            case "customer.subscription.created":
            case "customer.subscription.updated":
              await upsertSubscription(event.data.object as AnySub, env);
              break;
            case "customer.subscription.deleted":
              await markCanceled(event.data.object as AnySub, env);
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
