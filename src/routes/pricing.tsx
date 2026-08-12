import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { AppShell, PageHead } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/lib/store";
import { usePaymentsStatus } from "@/hooks/use-payments-status";
import { PLANS } from "@/lib/billing";

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
  const [plan, setPlan] = usePlan();
  const { status: payments } = usePaymentsStatus();

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Free to build"
          title="Pay only to be online."
          description="Building your Knowledge Core and previewing every generated file costs nothing. Hosting your published presence is the paid part."
        />

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
              </ul>
              <Button
                className="mt-6"
                variant={p.id === "pro" ? "default" : "outline"}
                disabled={plan === p.id}
                onClick={() => setPlan(p.id)}
              >
                {plan === p.id ? "Current plan" : `Choose ${p.name}`}
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
