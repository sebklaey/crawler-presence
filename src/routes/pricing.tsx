import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { AppShell, PageHead } from "@/components/app-shell";
import { PaymentTestModeBanner } from "@/components/payment-test-mode-banner";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/lib/store";
import { usePaymentsStatus } from "@/hooks/use-payments-status";
import { PLANS } from "@/lib/billing";
import { useFunnelOnce } from "@/lib/funnel";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Crawler" },
      {
        name: "description",
        content: "Creating and previewing a presence is free. Hosting starts at $5/month — Plus, Pro and Business.",
      },
      { property: "og:title", content: "Pricing — Crawler" },
      { property: "og:description", content: "Plus $5, Pro $20, Business $80 per month. Creation and preview stay free." },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  useFunnelOnce("pricing_viewed");
  const [plan, setPlan] = usePlan();
  const { status: payments } = usePaymentsStatus();

  return (
    <AppShell>
      <PaymentTestModeBanner />
      <div className="mx-auto max-w-6xl px-5 pb-24 pt-14">

        <PageHead
          eyebrow="Digital SaaS hosting"
          title="Pay only to host your Presence online."
          description="Building your Knowledge Core and previewing every generated file costs nothing. Each paid plan is a monthly subscription to Crawler's online software and digital Presence hosting."
        />

        <p className="-mt-4 mb-8 max-w-2xl text-xs text-muted-foreground">
          <strong className="text-foreground">The product sold here is digital SaaS hosting.</strong> Every plan is
          delivered online and activated electronically after purchase. Plans include hosted AI-readable text files,
          data endpoints and software analytics only. No physical item, merchandise, hardware or printed material is
          sold, bundled, delivered or shipped, and no delivery address is required. Cancel any time; see the{" "}
          <Link to="/refunds" className="underline underline-offset-4">
            refund policy
          </Link>
          .
        </p>


        {!payments.configured ? (
          <div className="mb-8 rounded-xl border border-dashed border-border bg-secondary/60 px-4 py-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Demo / test mode.</strong> No payment credentials are configured, so
            checkout simulates a subscription locally instead of charging anything. Add Paddle credentials later to
            switch the same flow to live checkout.
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={`flex flex-col rounded-2xl border bg-card p-6 ${
                p.id === "pro" ? "border-foreground" : "border-border"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="display text-2xl">{p.name}</h2>
                {p.id === "pro" ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary-foreground">
                    Most chosen
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="display text-4xl">${p.price}</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
                {(p.planned ?? []).map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-30" />
                    <span className="text-muted-foreground/60">
                      {f} <span className="text-[10px] uppercase tracking-wide">— planned</span>
                    </span>
                  </li>
                ))}
                {(p.notIncluded ?? []).map((f) => (
                  <li key={f} className="flex gap-2">
                    <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-40" />
                    <span className="text-muted-foreground/60 line-through decoration-muted-foreground/30">{f}</span>
                  </li>
                ))}
              </ul>
              {p.upgradeNote ? (
                <p className="mt-4 rounded-lg border border-dashed border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                  {p.upgradeNote}
                </p>
              ) : null}

              <Button asChild className="mt-6" variant={p.id === "pro" ? "default" : "outline"}>
                <Link to="/publish" search={{ plan: p.id }} onClick={() => setPlan(p.id)}>
                  {plan === p.id ? `Continue with ${p.name}` : `Choose ${p.name}`}
                </Link>
              </Button>

            </div>
          ))}
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Ready to go live?{" "}
          <Link to="/publish" className="underline underline-offset-4 hover:text-foreground">
            Open the publish flow
          </Link>
          .
        </p>
      </div>
    </AppShell>
  );
}
