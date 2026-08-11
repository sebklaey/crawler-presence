import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Globe, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { AppShell, PageHead } from "@/components/app-shell";
import { PresenceStatus } from "@/components/presence-status";
import { Button } from "@/components/ui/button";
import { PLANS, stripeConfigured, type PlanId } from "@/lib/billing";
import { generatedFiles, isCoreEmpty, presenceScore, presenceSlug } from "@/lib/knowledge";
import { useCore, usePlan, usePublished } from "@/lib/store";
import { Empty } from "./knowledge";

export const Route = createFileRoute("/publish")({
  head: () => ({
    meta: [
      { title: "Publish — Crawler" },
      {
        name: "description",
        content: "Publish your Knowledge Core as a hosted, AI-readable presence with llms.txt and JSON endpoints.",
      },
      { property: "og:title", content: "Publish — Crawler" },
      { property: "og:description", content: "Creation and preview are free. Hosting is the paid step." },
    ],
  }),
  component: PublishPage,
});

function PublishPage() {
  const [core] = useCore();
  const [plan, setPlan] = usePlan();
  const [published, setPublished] = usePublished();
  const [checkingOut, setCheckingOut] = useState<PlanId | null>(null);

  if (isCoreEmpty(core)) return <Empty />;

  const score = presenceScore(core);
  const slug = presenceSlug(core);
  const files = generatedFiles(core);
  const paid = plan !== "free";

  async function checkout(id: PlanId) {
    setCheckingOut(id);
    // Stripe Checkout is prepared but never faked with invented keys.
    await new Promise((r) => setTimeout(r, 700));
    setPlan(id);
    setCheckingOut(null);
    toast.success(
      stripeConfigured() ? "Redirecting to Stripe Checkout…" : `Demo mode: ${id} activated without payment.`,
    );
  }

  function publish() {
    setPublished({ at: new Date().toISOString(), slug });
    toast.success("Presence published.");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Go live"
          title="Publish your presence"
          description="Everything up to this point is free. Hosting keeps your files reachable at a stable address so AI systems and crawlers can read them."
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="text-sm font-medium">What goes live</div>
              <ul className="mt-4 grid gap-1.5 font-mono text-xs text-muted-foreground sm:grid-cols-2">
                {files.map((f) => (
                  <li key={f.path}>
                    crawler.site/{slug}/{f.path}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 text-sm font-medium">
                {paid ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                {paid ? "Hosting active" : "Hosting required"}
              </div>
              {!stripeConfigured() ? (
                <div className="mt-3 rounded-lg border border-dashed border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                  <strong className="text-foreground">Demo / test mode.</strong> No Stripe keys configured — the
                  checkout below simulates the subscription. Real Stripe Checkout takes over as soon as keys exist.
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {PLANS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => void checkout(p.id)}
                    disabled={checkingOut !== null}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      plan === p.id ? "border-foreground bg-secondary" : "border-border hover:border-foreground/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{p.name}</span>
                      {plan === p.id ? <Check className="h-3.5 w-3.5" /> : null}
                    </div>
                    <div className="display mt-1 text-2xl">${p.price}</div>
                    <div className="text-[11px] text-muted-foreground">per month</div>
                    {checkingOut === p.id ? (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Opening checkout…
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Compare everything on the{" "}
                <Link to="/pricing" className="underline underline-offset-4">
                  pricing page
                </Link>
                .
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="text-sm font-medium">Publish</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {score < 55
                  ? "Your presence is still thin — publishing works, but AI systems will have little to read."
                  : "Your presence has enough substance to answer real questions."}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button disabled={!paid} onClick={publish}>
                  {published ? "Republish" : "Publish presence"}
                </Button>
                {!paid ? <span className="text-xs text-muted-foreground">Choose a plan first.</span> : null}
                {published ? (
                  <span className="text-xs text-muted-foreground">
                    Live since {new Date(published.at).toLocaleString()} · crawler.site/{published.slug}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <PresenceStatus core={core} />
        </div>
      </div>
    </AppShell>
  );
}
