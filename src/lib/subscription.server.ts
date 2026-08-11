/**
 * Server-only subscription gate.
 *
 * Publishing is the paid step: both the website publish flow and the MCP
 * `publish_presence` tool ask this module whether the owning account has an
 * active subscription. It uses the service-role client, so it works from the
 * unauthenticated MCP endpoint once a draft has been claimed by an account.
 */
import { db } from "./mcp/db.server";

export type StripeEnv = "sandbox" | "live";

/** Which environment this deployment bills in. Live keys win when present. */
export function billingEnvironment(): StripeEnv {
  return process.env["STRIPE_LIVE_API_KEY"] ? "live" : "sandbox";
}

export type OwnerPlan = {
  active: boolean;
  plan: string | null;
  environment: StripeEnv;
};

const PLAN_BY_PRICE: Record<string, string> = {
  plus_monthly: "plus",
  pro_monthly: "pro",
  business_monthly: "business",
};

/** Active subscription lookup for an account id, or an inactive result. */
export async function ownerPlan(userId: string | null | undefined): Promise<OwnerPlan> {
  const env = billingEnvironment();
  const supabase = db();
  if (!userId || !supabase) return { active: false, plan: null, environment: env };

  const { data } = await supabase
    .from("subscriptions")
    .select("price_id, status, current_period_end")
    .eq("user_id", userId)
    .eq("environment", env)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { price_id: string; status: string; current_period_end: string | null } | null;
  if (!row) return { active: false, plan: null, environment: env };

  const notExpired = !row.current_period_end || Date.parse(row.current_period_end) > Date.now();
  const active =
    (["active", "trialing", "past_due"].includes(row.status) && notExpired) ||
    (row.status === "canceled" && notExpired);

  return { active, plan: PLAN_BY_PRICE[row.price_id] ?? null, environment: env };
}
