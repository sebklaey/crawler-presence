import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Globe, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { AppShell, PageHead } from "@/components/app-shell";
import { PresenceStatus } from "@/components/presence-status";
import { Button } from "@/components/ui/button";
import { PLANS, stripeConfigured, type PlanId } from "@/lib/billing";
import { generatedFiles, isCoreEmpty, presenceScore, type KnowledgeCore } from "@/lib/knowledge";
import { loadDraft, publishPresenceFn } from "@/lib/presence.functions";
import { useCore, usePlan, usePublished } from "@/lib/store";
import { Empty } from "./knowledge";

export const Route = createFileRoute("/publish")({
  validateSearch: (s: Record<string, unknown>) => ({
    session: typeof s["session"] === "string" ? (s["session"] as string) : undefined,
    plan: typeof s["plan"] === "string" ? (s["plan"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Publish — Crawler" },
      {
        name: "description",
        content: "Publish your Knowledge Core as a hosted, AI-readable presence with llms.txt and JSON endpoints.",
      },
      { property: "og:title", content: "Publish — Crawler" },
      { property: "og:description", content: "Creation and preview are free. Hosting is the paid step." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublishPage,
});

function PublishPage() {
  const search = Route.useSearch();
  const [core, setCore] = useCore();
  const [plan, setPlan] = usePlan();
  const [published, setPublished] = usePublished();
  const [checkingOut, setCheckingOut] = useState<PlanId | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [recovering, setRecovering] = useState(Boolean(search.session));

  // Handoff from ChatGPT: recover the anonymous draft carried in the URL.
  useEffect(() => {
    const token = search.session;
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await loadDraft({ data: { token } });
        if (cancelled) return;
        if (result.found) {
          setCore(result.core as KnowledgeCore);
          toast.success("Draft recovered from your ChatGPT session.");
        } else {
          toast.error("That draft link has expired. Start a new interview.");
        }
      } catch {
        if (!cancelled) toast.error("Could not recover that draft.");
      } finally {
        if (!cancelled) setRecovering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.session]);

  useEffect(() => {
    const p = search.plan;
    if (p === "plus" || p === "pro" || p === "business") setPlan(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.plan]);

  if (recovering) {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-5 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Recovering your draft…
        </div>
      </AppShell>
    );
  }

  if (isCoreEmpty(core)) return <Empty />;

  const score = presenceScore(core);
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

  async function publish() {
    if (plan === "free") return;
    setPublishing(true);
    try {
      const result = await publishPresenceFn({
        data: {
          core,
          plan,
          ...(search.session ? { sessionToken: search.session } : {}),
        },
      });
      setPublished({ at: result.publishedAt, slug: result.slug });
      toast.success(
        result.mode === "demo" ? "Demo publish complete — files are live." : "Presence published.",
      );
    } catch (e) {
      toast.error(`Publishing failed: ${String((e as Error).message ?? e)}`);
    } finally {
      setPublishing(false);
    }
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
                  <li key={f.path} className="break-all">
                    /p/{published?.slug ?? "<slug>"}/{f.path}
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
                  checkout below simulates the subscription and no payment is taken. Real Stripe Checkout takes over as
                  soon as keys exist.
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {PLANS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => void checkout(p.id)}
                    disabled={checkingOut !== null}
                    aria-label={`Choose the ${p.name} plan at $${p.price} per month`}
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
                <Button disabled={!paid || publishing} onClick={() => void publish()}>
                  {publishing ? "Publishing…" : published ? "Publish again" : "Publish presence"}
                </Button>
                {!paid ? <span className="text-xs text-muted-foreground">Choose a plan first.</span> : null}
              </div>

              {published ? (
                <div className="mt-5 rounded-lg border border-border bg-secondary/50 p-4">
                  <div className="text-xs text-muted-foreground">
                    Live since {new Date(published.at).toLocaleString()}
                  </div>
                  <a
                    href={`/p/${published.slug}`}
                    className="mt-1 block break-all text-sm underline underline-offset-4"
                  >
                    /p/{published.slug}
                  </a>
                  <ul className="mt-3 grid gap-1 font-mono text-[11px] text-muted-foreground">
                    {files.map((f) => (
                      <li key={f.path}>
                        <a className="break-all hover:text-foreground" href={`/p/${published.slug}/${f.path}`}>
                          /p/{published.slug}/{f.path}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>

          <PresenceStatus core={core} columns={1} />
        </div>
      </div>
    </AppShell>
  );
}
