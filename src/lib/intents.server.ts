/**
 * Publish intents — the accountless bridge between "I chose a plan" and
 * "this Presence is online".
 *
 * Crawler has no user accounts. A publish intent is an opaque, short-lived
 * capability (`pi_…`) that carries the chosen plan and, optionally, the
 * anonymous draft token. Payment metadata references only this intent, never a
 * person. Once the payment provider confirms the subscription, the intent may
 * be redeemed exactly once to publish a Presence and issue its management
 * secret.
 */
import { db } from "./mcp/db.server";
import { opaqueToken } from "./mcp/sessions";

export type BillingEnv = "sandbox" | "live";

/** Which environment this deployment bills in, derived from the Paddle key. */
export function billingEnvironment(): BillingEnv {
  return process.env["PADDLE_API_KEY"]?.includes("_live_") ? "live" : "sandbox";
}

export type IntentStatus = "pending" | "paid" | "published" | "demo";

export type PublishIntent = {
  intentRef: string;
  sessionToken: string | null;
  plan: string;
  status: IntentStatus;
  environment: BillingEnv;
  billingCustomerId: string | null;
  billingSubscriptionId: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  presenceSlug: string | null;
};

type Row = {
  intent_ref: string;
  session_token: string | null;
  plan: string;
  status: string;
  environment: string;
  billing_customer_id: string | null;
  billing_subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  presence_slug: string | null;
};

const COLUMNS =
  "intent_ref, session_token, plan, status, environment, billing_customer_id, billing_subscription_id, subscription_status, current_period_end, presence_slug";

function fromRow(row: Row): PublishIntent {
  return {
    intentRef: row.intent_ref,
    sessionToken: row.session_token,
    plan: row.plan,
    status: (["pending", "paid", "published", "demo"].includes(row.status) ? row.status : "pending") as IntentStatus,
    environment: row.environment === "live" ? "live" : "sandbox",
    billingCustomerId: row.billing_customer_id,
    billingSubscriptionId: row.billing_subscription_id,
    subscriptionStatus: row.subscription_status,
    currentPeriodEnd: row.current_period_end,
    presenceSlug: row.presence_slug,
  };
}

export function validIntentRef(ref: unknown): ref is string {
  return typeof ref === "string" && /^pi_[a-f0-9]{32}$/.test(ref);
}

export async function createIntent(input: {
  plan: string;
  sessionToken?: string | undefined;
  status: IntentStatus;
}): Promise<PublishIntent | null> {
  const supabase = db();
  if (!supabase) return null;
  const intentRef = opaqueToken("pi");
  const { error } = await supabase.from("publish_intents").insert({
    intent_ref: intentRef,
    session_token: input.sessionToken ?? null,
    plan: input.plan,
    status: input.status,
    environment: billingEnvironment(),
  });
  if (error) {
    console.error("[crawler] could not create publish intent", error.message);
    return null;
  }
  return getIntent(intentRef);
}

export async function getIntent(intentRef: string): Promise<PublishIntent | null> {
  if (!validIntentRef(intentRef)) return null;
  const supabase = db();
  if (!supabase) return null;
  const { data } = await supabase
    .from("publish_intents")
    .select(COLUMNS)
    .eq("intent_ref", intentRef)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data ? fromRow(data as Row) : null;
}

export async function attachCheckout(intentRef: string, checkoutId: string): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  await supabase.from("publish_intents").update({ billing_checkout_id: checkoutId }).eq("intent_ref", intentRef);
}

/** Called from the verified payment webhook only. */
export async function markIntentPaid(
  intentRef: string,
  billing: {
    billingCustomerId?: string | null;
    billingSubscriptionId?: string | null;
    subscriptionStatus?: string | null;
    currentPeriodEnd?: string | null;
  },
): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  const { data } = await supabase
    .from("publish_intents")
    .select("status")
    .eq("intent_ref", intentRef)
    .maybeSingle();
  const current = (data as { status?: string } | null)?.status;
  await supabase
    .from("publish_intents")
    .update({
      // Never downgrade an already redeemed intent.
      status: current === "published" ? "published" : "paid",
      billing_customer_id: billing.billingCustomerId ?? null,
      billing_subscription_id: billing.billingSubscriptionId ?? null,
      subscription_status: billing.subscriptionStatus ?? null,
      current_period_end: billing.currentPeriodEnd ?? null,
    })
    .eq("intent_ref", intentRef);
}

export async function markIntentPublished(intentRef: string, slug: string): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  await supabase
    .from("publish_intents")
    .update({ status: "published", presence_slug: slug })
    .eq("intent_ref", intentRef);
}

/**
 * A paid-but-not-yet-redeemed intent for an anonymous draft, if one exists.
 * This is what lets `publish_presence` go live straight from the conversation
 * after the user completed checkout on the website.
 */
export async function redeemableIntentForSession(sessionToken: string): Promise<PublishIntent | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data } = await supabase
    .from("publish_intents")
    .select(COLUMNS)
    .eq("session_token", sessionToken)
    .eq("status", "paid")
    .is("presence_slug", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? fromRow(data as Row) : null;
}

/** Any intent for this draft, used to tell "not paid" from "already live". */
export async function latestIntentForSession(sessionToken: string): Promise<PublishIntent | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data } = await supabase
    .from("publish_intents")
    .select(COLUMNS)
    .eq("session_token", sessionToken)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? fromRow(data as Row) : null;
}
