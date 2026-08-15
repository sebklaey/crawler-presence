/**
 * Plan limit gate.
 *
 * Every action that can run into a subscription boundary asks `guard(...)`
 * first. When the current plan covers the action it returns true and the
 * action continues. When it does not, the upgrade popup opens with the exact
 * limit that was hit, what the next plan unlocks, and a direct Paddle checkout
 * when payment credentials are configured. Falls back to the guided publish
 * flow when checkout is unavailable or the user has no Knowledge Core yet.
 *
 * Accountless rule: the plan lives in the local workspace only — no account,
 * no login, no profile.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PLANS, planById, type PlanId } from "@/lib/billing";
import { PLAN_INFO } from "@/lib/entitlements/catalog";
import { useCore, usePlan } from "@/lib/store";
import { usePaymentsStatus } from "@/hooks/use-payments-status";
import { isCoreEmpty } from "@/lib/knowledge";
import { startPublishFn } from "@/lib/presence.functions";
import { trackFunnel } from "@/lib/funnel";


export type LimitKey =
  | "content_records"
  | "documents"
  | "analytics_window"
  | "improvement_loop"
  | "detailed_insights"
  | "custom_domain"
  | "team_access"
  | "api_access"
  | "reports"
  | "continuous_updates";

export type GuardInput = {
  /** Which boundary the current action would cross. */
  limit: LimitKey;
  /** How many records/documents would exist after the action. */
  count?: number;
  /** Requested analytics window in days. */
  days?: number;
  /** What the user was doing, shown verbatim in the popup. */
  action?: string;
  /** Server-known plan of the managed Presence; overrides the local plan. */
  currentPlan?: PlanId;
};

type Blocked = {
  title: string;
  reason: string;
  action?: string;
  current: UiPlan;
  required: PlanId;
  unlocks: string[];
};

const order: PlanId[] = ["plus", "pro", "business"];

const nextPlanWhere = (from: UiPlan, ok: (p: PlanId) => boolean): PlanId => {
  const start = order.indexOf(from as PlanId);
  return order.slice(start + 1).find(ok) ?? "business";
};

/** What moving from `current` to `required` actually adds. */
function unlocksFor(current: PlanId, required: PlanId): string[] {
  const have = new Set(planById(current).features);
  return planById(required)
    .features.filter((f) => !have.has(f) && f !== "Everything in Plus" && f !== "Everything in Pro")
    .slice(0, 5);
}

export type PlanState = "loading" | "known" | "unavailable";

export type UiPlan = PlanId | "free";

type Ctx = { plan: UiPlan; state: PlanState; guard: (input: GuardInput) => boolean };

const PlanLimitContext = createContext<Ctx | null>(null);

export function usePlanLimits(): Ctx {
  const ctx = useContext(PlanLimitContext);
  // Fail closed: without the provider we know nothing about the plan, so no
  // paid action may proceed. The server stays the enforcing layer either way.
  return ctx ?? { plan: "free", state: "unavailable", guard: () => false };
}

export function PlanLimitProvider({ children }: { children: ReactNode }) {
  const [stored, , planHydrated] = usePlan();
  const [core] = useCore();
  const navigate = useNavigate();
  const { status: payments } = usePaymentsStatus();
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [busy, setBusy] = useState(false);

  // Free stays Free. The browser never promotes a plan on its own — only a
  // server response backed by a verified Paddle webhook/reconciliation does.
  const localPlan: UiPlan = stored;
  const planState: PlanState = planHydrated ? "known" : "loading";

  /** Open Paddle overlay for the blocked plan; fallback to /publish if unavailable. */
  async function buy(target: PlanId) {
    if (busy) return;
    // No optimistic unlock: the plan changes only after Paddle confirms.
    setBlocked(null);

    if (isCoreEmpty(core) || !payments.configured) {
      void navigate({ to: "/publish", search: { plan: target } });
      return;
    }

    setBusy(true);
    trackFunnel("checkout_started", { plan: target, fromStep: "limit_popup", toStep: "checkout" });
    try {
      const result = await startPublishFn({
        data: { core, plan: target, origin: window.location.origin },
      });
      if (result.kind === "error") {
        void navigate({ to: "/publish", search: { plan: target } });
        return;
      }
      try {
        localStorage.setItem("crawler:pending-plan", target);
        localStorage.setItem(
          "crawler:pending-intent",
          JSON.stringify({ ref: result.intentRef, at: Date.now() }),
        );
      } catch {
        /* ignore */
      }
      const successUrl = `${window.location.origin}/publish?intent=${encodeURIComponent(result.intentRef)}`;
      try {
        const { openPaddleCheckout } = await import("@/lib/paddle-client");
        await openPaddleCheckout({
          environment: result.environment,
          token: result.clientToken,
          transactionId: result.transactionId,
          successUrl,
        });
      } catch {
        window.location.href = result.url;
      }
    } catch {
      void navigate({ to: "/publish", search: { plan: target } });
    } finally {
      setBusy(false);
    }
  }


  const guard = useCallback(
    (input: GuardInput): boolean => {
      // Plan unknown (still loading or server unavailable) => fail closed.
      if (!input.currentPlan && planState !== "known") return false;
      const plan: UiPlan =
        input.currentPlan && order.includes(input.currentPlan) ? input.currentPlan : localPlan;
      // Free has no paid allowance at all — every guarded action needs a plan.
      if (plan === "free") {
        setBlocked({
          title: "This is a paid feature",
          reason: "Building and previewing is free. Publishing and hosting start with Crawler Plus ($5/month).",
          ...(input.action ? { action: input.action } : {}),
          current: "free",
          required: "plus",
          unlocks: [],
        });
        return false;
      }
      const p = planById(plan as PlanId);
      const deny = (b: Omit<Blocked, "current" | "required" | "unlocks"> & { required: PlanId }) => {
        setBlocked({ ...b, current: plan as PlanId, unlocks: unlocksFor(plan as PlanId, b.required) });
        return false;
      };

      switch (input.limit) {
        case "content_records": {
          const count = input.count ?? 0;
          if (count <= p.catalogLimit) return true;
          const required = nextPlanWhere(plan, (id) => planById(id).catalogLimit >= count);
          return deny({
            title: "Content record limit reached",
            reason: `Your ${p.name} plan hosts up to ${p.catalogLimit.toLocaleString("en-US")} content records. This would be number ${count.toLocaleString("en-US")}.`,
            ...(input.action ? { action: input.action } : {}),
            required,
          });
        }
        case "documents": {
          const count = input.count ?? 0;
          if (!Number.isFinite(p.documentLimit) || count <= p.documentLimit) return true;
          const required = nextPlanWhere(plan, (id) => {
            const l = planById(id).documentLimit;
            return !Number.isFinite(l) || l >= count;
          });
          return deny({
            title: "Document limit reached",
            reason: `Your ${p.name} plan keeps ${p.documentLimit} imported documents public. This would be number ${count}.`,
            ...(input.action ? { action: input.action } : {}),
            required,
          });
        }
        case "analytics_window": {
          const days = input.days ?? 7;
          if (days <= p.analyticsDays) return true;
          const required = nextPlanWhere(plan, (id) => planById(id).analyticsDays >= days);
          return deny({
            title: "Longer analytics window is a paid feature",
            reason: `Your ${p.name} plan measures a ${p.analyticsDays}-day window. You asked for ${days === 3650 ? "the full period" : `${days} days`}.`,
            ...(input.action ? { action: input.action } : {}),
            required,
          });
        }
        case "improvement_loop":
        case "detailed_insights": {
          if (p.improvementLoop) return true;
          return deny({
            title:
              input.limit === "improvement_loop"
                ? "Improvement recommendations start with Pro"
                : "Detailed insights start with Pro",
            reason: `Your ${p.name} plan shows basic measurement only. Pro turns your measured data into concrete recommendations and detailed insights.`,
            ...(input.action ? { action: input.action } : {}),
            required: "pro",
          });
        }
        case "custom_domain": {
          if (plan !== "plus") return true;
          return deny({
            title: "Custom domain starts with Pro",
            reason: `Your ${p.name} plan publishes on a Crawler address. Pro adds your own verified domain.`,
            ...(input.action ? { action: input.action } : {}),
            required: "pro",
          });
        }
        case "team_access":
        case "api_access":
        case "reports":
        case "continuous_updates": {
          if (plan === "business") return true;
          const titles: Record<string, string> = {
            team_access: "Shared team access is a Business feature",
            api_access: "REST API access is a Business feature",
            reports: "Scheduled report emails are a Business feature",
            continuous_updates: "Daily monitoring and continuous updates are Business",
          };
          return deny({
            title: titles[input.limit] ?? "Business feature",
            reason: `Your ${p.name} plan does not include this. Business adds team access, the REST API, scheduled reports and daily source monitoring.`,
            ...(input.action ? { action: input.action } : {}),
            required: "business",
          });
        }
        default:
          return true;
      }
    },
    [localPlan, planState],
  );

  const value = useMemo(
    () => ({ plan: localPlan, state: planState, guard }),
    [localPlan, planState, guard],
  );
  const required = blocked ? planById(blocked.required) : null;

  return (
    <PlanLimitContext.Provider value={value}>
      {children}
      <Dialog open={Boolean(blocked)} onOpenChange={(o) => !o && setBlocked(null)}>
        <DialogContent className="sm:max-w-lg">
          {blocked && required ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  {blocked.title}
                </DialogTitle>
                <DialogDescription>
                  {blocked.action ? `${blocked.action} — ` : ""}
                  {blocked.reason}
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-xl border border-border bg-secondary/40 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">
                    {PLAN_INFO[blocked.current].name} → {required.name}
                  </span>
                  <span className="text-sm text-muted-foreground">${required.price}/month</span>
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  {blocked.unlocks.map((f) => (
                    <li key={f} className="flex gap-2">
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  Nothing is lost: content above your current limit stays stored and goes public again after the
                  upgrade. Cancel any time.
                </p>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="ghost" onClick={() => setBlocked(null)}>
                  Not now
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setBlocked(null);
                    void navigate({ to: "/pricing" });
                  }}
                >
                  Compare plans
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    void buy(blocked.required);
                  }}
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading…
                    </>
                  ) : (
                    <>Upgrade to {required.name}</>
                  )}
                </Button>

              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </PlanLimitContext.Provider>
  );
}

export const PLAN_IDS = PLANS.map((p) => p.id);
