import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Copy, ExternalLink, Globe, Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AppShell, PageHead } from "@/components/app-shell";
import { PaymentTestModeBanner } from "@/components/payment-test-mode-banner";
import { PresenceStatus } from "@/components/presence-status";
import { RecoveryCodeCard } from "@/components/recovery-code-card";
import { Button } from "@/components/ui/button";
import { HOSTING_BENEFITS, NO_GUARANTEE_NOTICE, PLANS, planById, recommendPlan, type PlanId } from "@/lib/billing";
import { trackFunnel, useFunnelOnce } from "@/lib/funnel";
import { generatedFiles, isCoreEmpty, presenceScore, type KnowledgeCore } from "@/lib/knowledge";
import { finalizePublishFn, loadDraft, startPublishFn } from "@/lib/presence.functions";
import { usePaymentsStatus } from "@/hooks/use-payments-status";
import { useCore, usePlan, usePublished } from "@/lib/store";
import { Empty } from "./knowledge";

export const Route = createFileRoute("/publish")({
  validateSearch: (s: Record<string, unknown>): { session?: string; plan?: string; intent?: string; canceled?: string } => ({
    ...(typeof s["session"] === "string" ? { session: s["session"] as string } : {}),
    ...(typeof s["plan"] === "string" ? { plan: s["plan"] as string } : {}),
    ...(typeof s["intent"] === "string" ? { intent: s["intent"] as string } : {}),
    ...(typeof s["canceled"] === "string" ? { canceled: s["canceled"] as string } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Publish — Crawler" },
      {
        name: "description",
        content:
          "Publish your Knowledge Core as a hosted, AI-readable presence with llms.txt and JSON endpoints. No account, no login — a one-time recovery code controls it.",
      },
      { property: "og:title", content: "Publish — Crawler" },
      { property: "og:description", content: "Creation and preview are free. You only pay to be online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublishPage,
});

const PENDING_INTENT_KEY = "crawler:pending-intent";
const PENDING_PLAN_KEY = "crawler:pending-plan";
/** A checkout attempt older than this is stale and must never block the page. */
const PENDING_INTENT_TTL_MS = 30 * 60 * 1000;

/** Remembers the open checkout with a timestamp, so it can expire on its own. */
function storePendingIntent(intentRef: string) {
  try {
    localStorage.setItem(PENDING_INTENT_KEY, JSON.stringify({ ref: intentRef, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

function readPendingIntent(): string | null {
  try {
    const raw = localStorage.getItem(PENDING_INTENT_KEY);
    if (!raw) return null;
    if (raw.startsWith("pi_")) {
      // Legacy value without a timestamp — drop it rather than block the page.
      localStorage.removeItem(PENDING_INTENT_KEY);
      return null;
    }
    const parsed = JSON.parse(raw) as { ref?: string; at?: number };
    if (!parsed.ref || !parsed.at || Date.now() - parsed.at > PENDING_INTENT_TTL_MS) {
      localStorage.removeItem(PENDING_INTENT_KEY);
      return null;
    }
    return parsed.ref;
  } catch {
    localStorage.removeItem(PENDING_INTENT_KEY);
    return null;
  }
}

function clearPendingIntent() {
  try {
    localStorage.removeItem(PENDING_INTENT_KEY);
  } catch {
    /* ignore */
  }
}

type Issued = { slug: string; publishedAt: string; paths: string[]; recoveryCode: string; mode: "live" | "demo" };

/**
 * Explicit publication states. The UI may only claim "live" in `published`,
 * which is reached exclusively through a server-confirmed publication.
 */
type Phase =
  | "draft"
  | "ready_to_publish"
  | "checkout_open"
  | "checkout_pending"
  | "payment_confirmed"
  | "publishing"
  | "published"
  | "payment_failed"
  | "publish_failed"
  | "demo";


function PublishPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [core, setCore] = useCore();
  const [, setPublished] = usePublished();
  const [, setStoredPlan] = usePlan();
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [step, setStep] = useState<"plans" | "summary">("plans");
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(Boolean(search.session));
  const [recovered, setRecovered] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [phase, setPhase] = useState<Phase>(search.intent ? "checkout_pending" : "draft");
  const [failure, setFailure] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<string | null>(search.intent ?? null);
  const { status: paymentsStatus } = usePaymentsStatus();

  useFunnelOnce("publish_clicked");

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
          setRecovered(true);
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

  // Restore a plan chosen earlier (URL, or an abandoned checkout attempt).
  useEffect(() => {
    const p = search.plan;
    if (p === "plus" || p === "pro" || p === "business") {
      setSelected(p);
      return;
    }
    try {
      const stored = localStorage.getItem(PENDING_PLAN_KEY);
      if (stored === "plus" || stored === "pro" || stored === "business") setSelected(stored);
    } catch {
      /* ignore */
    }
  }, [search.plan]);

  useEffect(() => {
    if (!search.canceled) return;
    trackFunnel("checkout_abandoned");
    toast.message("Checkout canceled. Nothing was charged, nothing was published — your draft is safe.");
    setPhase("draft");
  }, [search.canceled]);

  const finalize = useCallback(
    async (intentRef: string) => {
      const result = await finalizePublishFn({ data: { intentRef, core } });
      if (result.kind !== "pending") clearPendingIntent();
      if (result.kind === "published") {
        localStorage.removeItem(PENDING_PLAN_KEY);
        trackFunnel("payment_confirmed", { plan: result.plan as PlanId, presenceSlug: result.slug });
        trackFunnel("publish_completed", { presenceSlug: result.slug });
        setIssued({
          slug: result.slug,
          publishedAt: result.publishedAt,
          paths: result.paths,
          recoveryCode: result.recoveryCode,
          mode: result.mode,
        });
        setPublished({ at: result.publishedAt, slug: result.slug });
        setPhase(result.mode === "demo" ? "demo" : "published");
        toast.success("Payment confirmed — your Presence is live.");
        return true;
      }
      if (result.kind === "already") {
        setPublished({ at: new Date().toISOString(), slug: result.slug });
        setPhase("published");
        toast.message("This Presence is already published. Use your recovery code to manage it.");
        return true;
      }
      if (result.kind === "expired") {
        setPhase("payment_failed");
        setFailure("That checkout link has expired. Nothing was published and nothing was charged.");
        return true;
      }
      return false;
    },
    [core, setPublished],
  );

  // Returning from checkout: the intent travels in the URL, and as a
  // short-lived local fallback for hosted redirects that drop the query.
  useEffect(() => {
    if (search.intent) {
      setPendingIntent(search.intent);
      setPhase("checkout_pending");
      return;
    }
    const stored = readPendingIntent();
    if (stored) {
      setPendingIntent(stored);
      setPhase("checkout_pending");
    }
  }, [search.intent]);


  // Return from hosted checkout: poll until the payment webhook has landed.
  useEffect(() => {
    const intentRef = pendingIntent;
    if (!intentRef) return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const done = await finalize(intentRef);
        if (done || cancelled) return;
      } catch {
        /* keep polling */
      }
      if (attempts >= 20) {
        setPhase("publish_failed");
        setFailure(
          "Payment confirmation is taking unusually long. Your draft and any payment are safely stored — try again in a minute.",
        );
        return;
      }
      window.setTimeout(() => void tick(), 3000);
    };
    void tick();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIntent]);

  const score = presenceScore(core);
  const files = useMemo(() => generatedFiles(core), [core]);
  const payments = paymentsStatus.configured;
  const recommendation = useMemo(
    () =>
      recommendPlan({
        itemCount: core.items?.length ?? 0,
        hasWebsite: Boolean(core.website),
      }),
    [core.items, core.website],
  );

  const retryIntent = useCallback(() => {
    const stored = readPendingIntent();
    if (!stored) {
      setPhase("draft");
      setFailure(null);
      return;
    }
    setFailure(null);
    setPhase("checkout_pending");
    setPendingIntent(null);
    window.setTimeout(() => setPendingIntent(stored), 50);
  }, []);

  /** Escape hatch: never let an abandoned checkout lock the publish page. */
  const abandonCheckout = useCallback(() => {
    clearPendingIntent();
    setPendingIntent(null);
    setFailure(null);
    setPhase("draft");
    void navigate({ to: "/publish", search: {}, replace: true });
  }, [navigate]);


  async function publish(planId: PlanId) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    trackFunnel("checkout_started", { plan: planId, fromStep: "plan_summary", toStep: "checkout" });
    try {
      localStorage.setItem(PENDING_PLAN_KEY, planId);
      const result = await startPublishFn({
        data: {
          core,
          plan: planId,
          origin: window.location.origin,
          ...(search.session ? { sessionToken: search.session } : {}),
        },
      });
      if (result.kind === "error") {
        trackFunnel("publish_failed", { plan: planId, errorCategory: "checkout_start" });
        setPhase("publish_failed");
        setFailure(result.message);
        return;
      }

      const successUrl = `${window.location.origin}/publish?intent=${encodeURIComponent(result.intentRef)}`;
      storePendingIntent(result.intentRef);
      try {
        // Overlay in this tab: the environment and token come from the server,
        // so the overlay always matches the transaction that was created.
        const { openPaddleCheckout } = await import("@/lib/paddle-client");
        await openPaddleCheckout({
          environment: result.environment,
          token: result.clientToken,
          transactionId: result.transactionId,
          successUrl,
        });
        setPhase("checkout_open");
      } catch {
        // Hosted fallback if Paddle.js cannot load (blocked script, etc.).
        window.location.href = result.url;
      }
    } catch (e) {
      trackFunnel("publish_failed", { plan: planId, errorCategory: "network" });
      setPhase("publish_failed");
      setFailure(`Publishing failed: ${String((e as Error).message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }


  if (recovering) {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-5 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Recovering your draft…
        </div>
      </AppShell>
    );
  }

  if (phase === "checkout_pending" && pendingIntent) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-5 py-24">
          <h1 className="display text-3xl">Publication is not finished yet.</h1>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Waiting for the payment provider to confirm…
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Keep this tab open. Nothing is live until the server confirms the publication. Your recovery code appears
            here once, right afterwards.
          </p>
        </div>
      </AppShell>
    );
  }

  if (isCoreEmpty(core) && !recovered && !issued) return <Empty />;

  /* ---------------- Success state ---------------- */
  if (issued) {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${base}/p/${issued.slug}`;
    const proPlus = planById(selected ?? "plus").id !== "plus";
    return (
      <AppShell>
        <PaymentTestModeBanner />
        <div className="mx-auto max-w-3xl px-5 pb-24 pt-14">
          <PageHead
            eyebrow="Published"
            title="Your Presence is live."
            description={
              "The server confirmed the publication. Your files are reachable at the URLs below."
            }
          />

          <div className="space-y-6">
            <RecoveryCodeCard code={issued.recoveryCode} slug={issued.slug} />

            <section className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-sm font-medium">Your public Presence</h2>
              <a href={`/p/${issued.slug}`} className="mt-1 block break-all text-sm underline underline-offset-4">
                {url}
              </a>
              <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  Plan: <span className="text-foreground">{planById(selected ?? "plus").name}</span>
                </div>
                <div>
                  Published: <span className="text-foreground">{new Date(issued.publishedAt).toLocaleString()}</span>
                </div>
                <div>
                  Status:{" "}
                  <span className="text-foreground">Live</span>
                </div>
              </div>
              <ul className="mt-4 grid gap-1 font-mono text-[11px] text-muted-foreground">
                {issued.paths.map((path) => (
                  <li key={path}>
                    <a className="break-all hover:text-foreground" href={`/p/${issued.slug}/${path}`}>
                      /p/{issued.slug}/{path}
                    </a>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <a href={`/p/${issued.slug}`}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open Presence
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(url);
                    toast.success("URL copied.");
                  }}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy URL
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/analytics">View analytics</Link>
                </Button>
                {proPlus ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/manage">Connect custom domain</Link>
                  </Button>
                ) : null}
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                Next step: keep your recovery code safe, then manage the Presence any time at{" "}
                <Link to="/manage" className="underline underline-offset-4">
                  /manage
                </Link>
                . {NO_GUARANTEE_NOTICE}
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-sm font-medium">Use your Knowledge Core with AI</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Your published Knowledge Core is now retrievable by compatible AI systems and agents. They look it up
                when they need current information about you — Crawler Today cannot make any model train on, memorise
                or automatically mention it.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">Ask an assistant something like:</p>
              <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 text-[11px] leading-relaxed">
{`Use Crawler Today to retrieve the latest published information about ${issued.slug}.`}
              </pre>
              <p className="mt-3 text-xs text-muted-foreground">
                MCP clients connect <code>https://crawler.today/mcp</code>; everything else uses the REST API:
              </p>
              <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 text-[11px] leading-relaxed">
{`curl "https://crawler.today/api/crawl-me?id=${issued.slug}"`}
              </pre>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Details in the{" "}
                <a href="/crawlme" className="underline underline-offset-4">
                  CrawlMe developer documentation
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </AppShell>
    );
  }

  /* ---------------- Failure states ---------------- */
  const failureState = phase === "payment_failed" || phase === "publish_failed" ? phase : null;

  const plan = selected ? planById(selected) : null;

  return (
    <AppShell>
      <PaymentTestModeBanner />
      <div className="mx-auto max-w-5xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Digital SaaS hosting"
          title="Host your Presence online"
          description="Everything up to this point is free. A paid plan provides online software hosting for your AI-readable files and endpoints. It is delivered electronically and contains no physical goods."
        />

        {failureState ? (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-foreground bg-card p-5"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              {failureState === "payment_failed"
                ? "Publication is not finished yet."
                : "Payment is safe, publication could not be completed."}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {failure ??
                "The payment succeeded, but the publication could not be completed yet. Your draft and your payment are safely stored."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={retryIntent}>
                Try again
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/support">Contact support</Link>
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {step === "plans" ? (
              <>
                <section className="rounded-2xl border border-border bg-card p-6">
                  <h2 className="text-sm font-medium">With hosting you get:</h2>
                  <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
                    {HOSTING_BENEFITS.map((b) => (
                      <li key={b} className="flex gap-2 text-sm text-muted-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 rounded-lg border border-dashed border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                    {NO_GUARANTEE_NOTICE}
                  </p>
                </section>

                <section className="rounded-2xl border border-border bg-card p-6">
                  <h2 className="text-sm font-medium">Recommended for you</h2>
                  <p className="mt-2 text-sm">
                    Based on your current Knowledge Core we recommend{" "}
                    <strong>{planById(recommendation.plan).name}</strong>. You can pick any other plan.
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {recommendation.reasons.slice(0, 2).map((r) => (
                      <li key={r}>· {r}</li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-2xl border border-border bg-card p-6">
                  <h2 className="flex items-center gap-2 text-sm font-medium">
                    {payments ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                    Choose your digital hosting plan
                  </h2>

                  {!payments ? (
                    <div className="mt-3 rounded-lg border border-dashed border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                      <strong className="text-foreground">Checkout is temporarily unavailable.</strong> Crawler Alpha
                      0.0.2 is paid-only: publishing and hosting always require an active subscription. Building and
                      previewing stay free — please try the checkout again shortly.
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      You are purchasing a digital SaaS subscription for online Presence hosting, billed monthly and
                      cancellable at any time. Nothing physical is sold or shipped. Checkout receives only an anonymous
                      reference to this publish request.
                    </p>
                  )}

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    {PLANS.map((p) => {
                      const isSelected = selected === p.id;
                      return (
                        <div
                          key={p.id}
                          className={`flex flex-col rounded-2xl border p-5 text-left transition-colors ${
                            isSelected ? "border-foreground bg-secondary" : "border-border hover:border-foreground/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">{p.name}</span>
                                {p.recommended ? (
                                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary-foreground">
                                    Recommended
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">{p.subtitle}</div>
                              <div className="mt-2 flex items-baseline gap-1">
                                <span className="display text-2xl">${p.price}</span>
                                <span className="text-xs text-muted-foreground">/month, billed monthly</span>
                              </div>
                            </div>
                            {isSelected ? <Check className="h-4 w-4 shrink-0" /> : null}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-1">
                            {p.audience.map((a) => (
                              <span key={a} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {a}
                              </span>
                            ))}
                          </div>

                          <ul className="mt-4 flex-1 space-y-1.5">
                            {p.benefits.map((f) => (
                              <li key={f} className="flex gap-2 text-xs text-muted-foreground">
                                <Check className="mt-0.5 h-3 w-3 shrink-0" />
                                <span>{f}</span>
                              </li>
                            ))}
                          </ul>

                          <Button
                            className="mt-5"
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              setSelected(p.id);
                              setStoredPlan(p.id);
                              trackFunnel("plan_selected", { plan: p.id, fromStep: "plans", toStep: "summary" });
                              setStep("summary");
                            }}
                          >
                            {p.cta}
                          </Button>
                        </div>
                      );
                    })}
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground">
                    Compare everything on the{" "}
                    <Link to="/pricing" className="underline underline-offset-4">
                      pricing page
                    </Link>
                    .
                  </p>
                </section>
              </>
            ) : null}

            {step === "summary" && plan ? (
              <section className="rounded-2xl border border-border bg-card p-6">
                <button
                  onClick={() => setStep("plans")}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Change plan
                </button>

                <h2 className="mt-4 text-sm font-medium">Order summary</h2>
                <dl className="mt-4 divide-y divide-border text-sm">
                  <div className="flex justify-between py-2">
                    <dt className="text-muted-foreground">Plan</dt>
                    <dd>
                      {plan.name} — {plan.subtitle}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-muted-foreground">Price</dt>
                    <dd>${plan.price} per month</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-muted-foreground">Billing</dt>
                    <dd>Monthly, recurring until you cancel</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2">
                    <dt className="text-muted-foreground">Presence</dt>
                    <dd className="text-right">{core.name || "Untitled presence"}</dd>
                  </div>
                </dl>

                <h3 className="mt-5 text-xs uppercase tracking-wide text-muted-foreground">Included</h3>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2 text-xs text-muted-foreground">
                      <Check className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 rounded-lg border border-dashed border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 text-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" /> Before you continue
                  </div>
                  <ul className="mt-2 space-y-1">
                    <li>· No registration and no account — a one-time management code controls the Presence.</li>
                    <li>· Clear monthly price, cancel any time at /manage with your recovery code.</li>
                    <li>· Payment is handled externally by the payment provider; Crawler never sees card data.</li>
                    <li>· {NO_GUARANTEE_NOTICE}</li>
                    <li>
                      · Operated by SEBKLAEY ·{" "}
                      <Link to="/support" className="underline underline-offset-4">
                        Support
                      </Link>{" "}
                      ·{" "}
                      <Link to="/privacy" className="underline underline-offset-4">
                        Privacy
                      </Link>{" "}
                      ·{" "}
                      <Link to="/terms" className="underline underline-offset-4">
                        Terms
                      </Link>{" "}
                      ·{" "}
                      <Link to="/refunds" className="underline underline-offset-4">
                        Refunds
                      </Link>
                    </li>
                  </ul>
                </div>

                <Button className="mt-5 w-full sm:w-auto" disabled={busy} onClick={() => void publish(plan.id)}>
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening secure checkout…
                    </>
                  ) : payments ? (
                    `Publish for $${plan.price}/month`
                  ) : (
                    `Checkout unavailable — ${plan.name} $${plan.price}/month`
                  )}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  {payments
                    ? "You will be taken to the payment provider. A checkout link is not a payment — your Presence goes live only after the server confirms it."
                    : "Publishing requires a paid subscription. Nothing is published until a payment is confirmed."}
                </p>
              </section>
            ) : null}

            <section className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-sm font-medium">What goes live</h2>
              <ul className="mt-4 grid gap-1.5 font-mono text-xs text-muted-foreground sm:grid-cols-2">
                {files.map((f) => (
                  <li key={f.path} className="break-all">
                    /p/&lt;slug&gt;/{f.path}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                {score < 55
                  ? "Your presence is still thin — publishing works, but AI systems will have little to read."
                  : "Your presence has enough substance to answer real questions."}
              </p>
              <div className="mt-4">
                <Button variant="ghost" size="sm" onClick={() => void navigate({ to: "/manage" })}>
                  Already published? Manage with your recovery code
                </Button>
              </div>
            </section>
          </div>

          <PresenceStatus core={core} columns={1} />
        </div>
      </div>
    </AppShell>
  );
}
