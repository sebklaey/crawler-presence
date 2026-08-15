/**
 * Turns a blocked tool call into a friendly, structured upgrade answer that
 * ChatGPT can render as normal content — never a crash and never a raw error.
 *
 * The checkout link is created server-side against the real Paddle
 * integration. Secrets, room tokens and recovery codes never appear in a URL:
 * the caller context travels as a short-lived signed handoff token.
 */
import { siteUrl } from "../mcp/site";
import {
  PLAN_INFO,
  PLAN_ORDER,
  requiredPlanForTool,
  type CustomerPlan,
  type EntitlementPlan,
} from "./catalog";
import { hasEntitlement, highestPlan, planRankOf } from "./features";


export type UpgradePayload = {
  ok: false;
  code: "upgrade_required" | "limit_reached" | "admin_only";
  feature: string;
  tool: string;
  current_plan: string;
  required_plan: EntitlementPlan;
  required_plan_price: number | null;
  upgrade_url: string;
  cta_label: string;
  unlocks: string[];
  message: string;
  usage?: { used: number; max: number; unit: string };
};

const CACHE_MS = 10 * 60 * 1000;
const linkCache = new Map<string, { url: string; at: number }>();

async function signedHandoff(context: string | null): Promise<string | null> {
  if (!context) return null;
  const secret = process.env["SUBJECT_HASH_SECRET"];
  if (!secret) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = `${context}.${Math.floor(Date.now() / 1000)}`;
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(mac).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${Math.floor(Date.now() / 1000)}.${hex}`;
}

/**
 * A direct Paddle checkout URL for one plan. Falls back to Crawler's own
 * checkout page (which opens the same Paddle flow) when the provider cannot be
 * reached, so the answer always contains a working link.
 */
export async function checkoutUrlFor(plan: CustomerPlan, contextHash?: string | null): Promise<string> {
  const handoff = await signedHandoff(contextHash ?? null).catch(() => null);
  const fallback = `${siteUrl()}/publish?plan=${plan}${handoff ? `&h=${encodeURIComponent(handoff)}` : ""}`;
  if (plan === "free") return `${siteUrl()}/room`;

  const cached = linkCache.get(plan);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.url;

  try {
    const { paymentsReady } = await import("../payments-config");
    if (!paymentsReady()) return fallback;
    const { createIntent } = await import("../intents.server");
    const intent = await createIntent({ plan, status: "pending" });
    if (!intent) return fallback;
    const { createHostedCheckout } = await import("../paddle.server");
    const checkout = await createHostedCheckout({ plan, intentRef: intent.intentRef });
    linkCache.set(plan, { url: checkout.url, at: Date.now() });
    return checkout.url;
  } catch {
    return fallback;
  }
}

const GERMAN_HINT = /\b(ich|nicht|und|mein|meine|raum|räume|bitte|kann|erstellen|wie|das|der|die)\b/i;

/** Best-effort language detection from what the user actually sent. */
export function detectLanguage(input: unknown): "de" | "en" {
  const text = JSON.stringify(input ?? "");
  return GERMAN_HINT.test(text) ? "de" : "en";
}

function priceLabel(plan: EntitlementPlan): string {
  const price = PLAN_INFO[plan].price;
  return price === null || price === 0 ? "" : `$${price}/month`;
}

export type UpgradeInput = {
  tool: string;
  feature?: string;
  currentPlan: string;
  language?: "de" | "en";
  contextHash?: string | null;
  usage?: { used: number; max: number; unit: string };
  limitKey?: string;
  /**
   * Plan that the blocked *feature* really needs. Overrides the tool-level
   * mapping — one tool (create_public_room) can serve several tiers
   * (standard room = Plus, community room = Pro).
   */
  requiredPlan?: string | null;

};

/** Structured `upgrade_required` / `limit_reached` answer for a blocked tool. */
/** Tools that may only link to /pricing, never to a checkout. */
const INFO_ONLY_TOOLS = new Set([
  "start_love_interview",
  "answer_love_interview_question",
  "activate_love_profile",
  "find_love_candidate",
  "send_love_match_request",
  "respond_to_love_match",
]);

export async function buildUpgradePayload(input: UpgradeInput): Promise<UpgradePayload> {
  const toolRequired = requiredPlanForTool(input.tool);
  // A feature-level requirement always wins over the tool-level default, so a
  // Pro user is never asked to buy Plus.
  let required: EntitlementPlan =
    toolRequired === "admin"
      ? "admin"
      : input.requiredPlan
        ? highestPlan(input.requiredPlan)
        : toolRequired;
  // Limit errors: the plan is high enough, only the quota is exhausted — offer
  // the next tier above the current plan instead of a plan already owned.
  if (required !== "admin" && hasEntitlement(input.currentPlan, required)) {
    const next = PLAN_ORDER[Math.min(planRankOf(input.currentPlan) + 1, PLAN_ORDER.length - 1)]!;
    required = next;
  }
  const target: CustomerPlan | null =
    toolRequired === "admin" ? null : (required as CustomerPlan);
  const feature = input.feature ?? input.tool;
  const lang = input.language ?? "en";
  const info = PLAN_INFO[required];


  if (!target) {
    return {
      ok: false,
      code: "admin_only",
      feature,
      tool: input.tool,
      current_plan: input.currentPlan,
      required_plan: "admin",
      required_plan_price: null,
      upgrade_url: `${siteUrl()}/support`,
      cta_label: lang === "de" ? "Support kontaktieren" : "Contact support",
      unlocks: [],
      message:
        lang === "de"
          ? "Diese Funktion gehört zur internen Crawler-Plattformadministration und kann nicht gekauft werden."
          : "This tool is reserved for internal Crawler platform administration and cannot be purchased.",
    };
  }

  // Crawler Love never starts a checkout inside ChatGPT — only an
  // informational link to the pricing page is allowed.
  if (INFO_ONLY_TOOLS.has(input.tool)) {
    return {
      ok: false,
      code: "upgrade_required",
      feature,
      tool: input.tool,
      current_plan: input.currentPlan,
      required_plan: required,
      required_plan_price: PLAN_INFO[required].price,
      upgrade_url: `${siteUrl()}/pricing`,
      cta_label: lang === "de" ? "Tarife ansehen" : "View plans",
      unlocks: info.benefits.slice(0, 4),
      message:
        "Crawler Love is available with Crawler Pro and Business. You can view the feature details on the Crawler pricing page.",
    };
  }

  const url = await checkoutUrlFor(target, input.contextHash);
  const isLimit = Boolean(input.usage);
  const price = priceLabel(required);
  const cta =
    lang === "de"
      ? `Jetzt auf ${info.name} upgraden`
      : `Upgrade to ${info.name}`;

  const usageLine = input.usage
    ? lang === "de"
      ? ` ${input.usage.used} von ${input.usage.max} ${input.usage.unit} verwendet.`
      : ` ${input.usage.used} of ${input.usage.max} ${input.usage.unit} used.`
    : "";

  const message =
    lang === "de"
      ? `${feature} benötigt Crawler ${info.name} für ${price}. Dein aktueller Plan ist ${input.currentPlan}.${usageLine} Mit ${info.name} erhältst du: ${info.benefits.slice(0, 4).join(", ")}.`
      : `${feature} requires Crawler ${info.name} at ${price}. Your current plan is ${input.currentPlan}.${usageLine} ${info.name} unlocks: ${info.benefits.slice(0, 4).join(", ")}.`;

  return {
    ok: false,
    code: isLimit ? "limit_reached" : "upgrade_required",
    feature,
    tool: input.tool,
    current_plan: input.currentPlan,
    required_plan: required,
    required_plan_price: info.price,
    upgrade_url: url,
    cta_label: cta,
    unlocks: info.benefits,
    message,
    ...(input.usage ? { usage: input.usage } : {}),
  };
}
