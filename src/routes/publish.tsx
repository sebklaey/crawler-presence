import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Check, Globe, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { AppShell, PageHead } from "@/components/app-shell";
import { PaymentTestModeBanner } from "@/components/payment-test-mode-banner";
import { PresenceStatus } from "@/components/presence-status";
import { RecoveryCodeCard } from "@/components/recovery-code-card";
import { Button } from "@/components/ui/button";
import { PLANS, type PlanId } from "@/lib/billing";
import { generatedFiles, isCoreEmpty, presenceScore, type KnowledgeCore } from "@/lib/knowledge";
import { finalizePublishFn, loadDraft, startPublishFn } from "@/lib/presence.functions";
import { usePaymentsStatus } from "@/hooks/use-payments-status";
import { useCore, usePublished } from "@/lib/store";
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

type Issued = { slug: string; publishedAt: string; paths: string[]; recoveryCode: string; mode: "live" | "demo" };

function PublishPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [core, setCore] = useCore();
  const [published, setPublished] = usePublished();
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(Boolean(search.session));
  const [recovered, setRecovered] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [awaitingPayment, setAwaitingPayment] = useState(Boolean(search.intent));
  const [pendingIntent, setPendingIntent] = useState<string | null>(search.intent ?? null);
  const { status: paymentsStatus } = usePaymentsStatus();

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

  useEffect(() => {
    const p = search.plan;
    if (p === "plus" || p === "pro" || p === "business") setSelected(p);
  }, [search.plan]);

  useEffect(() => {
    if (search.canceled) toast.message("Checkout canceled. Nothing was charged and nothing was published.");
  }, [search.canceled]);

  const finalize = useCallback(
    async (intentRef: string) => {
      const result = await finalizePublishFn({ data: { intentRef, core } });
      if (result.kind !== "pending") localStorage.removeItem(PENDING_INTENT_KEY);
      if (result.kind === "published") {
        setIssued({
          slug: result.slug,
          publishedAt: result.publishedAt,
          paths: result.paths,
          recoveryCode: result.recoveryCode,
          mode: result.mode,
        });
        setPublished({ at: result.publishedAt, slug: result.slug });
        setAwaitingPayment(false);
        toast.success("Payment confirmed — your Presence is live.");
        return true;
      }
      if (result.kind === "already") {
        setPublished({ at: new Date().toISOString(), slug: result.slug });
        setAwaitingPayment(false);
        toast.message("This Presence is already published. Use your recovery code to manage it.");
        return true;
      }
      if (result.kind === "expired") {
        setAwaitingPayment(false);
        toast.error("That checkout link has expired. Nothing was published.");
        return true;
      }
      return false;
    },
    [core, setPublished],
  );

  // Paddle's hosted checkout returns to the success URL configured in Paddle,
  // which may not carry our query string — so the intent is also kept locally.
  useEffect(() => {
    if (search.intent) {
      setPendingIntent(search.intent);
      return;
    }
    const stored = localStorage.getItem(PENDING_INTENT_KEY);
    if (stored) {
      setPendingIntent(stored);
      setAwaitingPayment(true);
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
        setAwaitingPayment(false);
        toast.error("Payment confirmation is taking unusually long. Reload this page in a minute.");
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

  if (recovering) {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-5 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Recovering your draft…
        </div>
      </AppShell>
    );
  }

  if (awaitingPayment) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-5 py-24">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Confirming your payment and publishing…
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Keep this tab open. Your recovery code appears here once, right after publishing.
          </p>
        </div>
      </AppShell>
    );
  }

  if (isCoreEmpty(core) && !recovered && !issued) return <Empty />;

  const score = presenceScore(core);
  const files = generatedFiles(core);
  const payments = paymentsStatus.configured;

  async function publish() {
    if (!selected) {
      toast.error("Choose a plan first.");
      return;
    }
    setBusy(true);
    try {
      const result = await startPublishFn({
        data: {
          core,
          plan: selected,
          origin: window.location.origin,
          ...(search.session ? { sessionToken: search.session } : {}),
        },
      });
      if (result.kind === "checkout") {
        localStorage.setItem(PENDING_INTENT_KEY, result.intentRef);
        window.location.href = result.url;
        return;
      }
      if (result.kind === "demo") {
        setIssued({
          slug: result.slug,
          publishedAt: result.publishedAt,
          paths: result.paths,
          recoveryCode: result.recoveryCode,
          mode: "demo",
        });
        setPublished({ at: result.publishedAt, slug: result.slug });
        toast.success("Demo publish complete — files are live but clearly labelled as a demo.");
        return;
      }
      toast.error(result.message);
    } catch (e) {
      toast.error(`Publishing failed: ${String((e as Error).message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PaymentTestModeBanner />
      <div className="mx-auto max-w-5xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Go live"
          title="Publish your presence"
          description="Everything up to this point is free. You only pay to be online. There is no account and no login: publishing hands you a one-time recovery code that controls the Presence."
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {issued ? (
              <>
                <RecoveryCodeCard code={issued.recoveryCode} slug={issued.slug} />
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="text-sm font-medium">
                    {issued.mode === "demo" ? "Demo publish complete" : "Live since"}{" "}
                    {new Date(issued.publishedAt).toLocaleString()}
                  </div>
                  <a href={`/p/${issued.slug}`} className="mt-1 block break-all text-sm underline underline-offset-4">
                    /p/{issued.slug}
                  </a>
                  <ul className="mt-3 grid gap-1 font-mono text-[11px] text-muted-foreground">
                    {issued.paths.map((path) => (
                      <li key={path}>
                        <a className="break-all hover:text-foreground" href={`/p/${issued.slug}/${path}`}>
                          /p/{issued.slug}/{path}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Manage it any time at{" "}
                    <Link to="/manage" className="underline underline-offset-4">
                      /manage
                    </Link>{" "}
                    with the code above.
                  </p>
                </div>
              </>
            ) : null}

            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="text-sm font-medium">What goes live</div>
              <ul className="mt-4 grid gap-1.5 font-mono text-xs text-muted-foreground sm:grid-cols-2">
                {files.map((f) => (
                  <li key={f.path} className="break-all">
                    /p/{issued?.slug ?? published?.slug ?? "<slug>"}/{f.path}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 text-sm font-medium">
                {payments ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                Choose your plan
              </div>

              {!payments ? (
                <div className="mt-3 rounded-lg border border-dashed border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                  <strong className="text-foreground">Demo / test mode.</strong> No payment credentials are configured
                  on this deployment, so no subscription is created and no charge is made. The same flow runs and the
                  Presence is published, clearly labelled as a demo.
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  Checkout happens with our payment provider. Crawler creates no account and sends no personal
                  identifier — only an anonymous reference to this publish request.
                </p>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {PLANS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    aria-label={`Choose the ${p.name} plan at $${p.price} per month`}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      selected === p.id ? "border-foreground bg-secondary" : "border-border hover:border-foreground/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{p.name}</span>
                      {selected === p.id ? <Check className="h-3.5 w-3.5" /> : null}
                    </div>
                    <div className="display mt-1 text-2xl">${p.price}</div>
                    <div className="text-[11px] text-muted-foreground">per month</div>
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
                <Button disabled={busy || !selected} onClick={() => void publish()}>
                  {busy ? "Working…" : payments ? "Continue to checkout" : "Publish in demo mode"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {payments
                    ? "You will be redirected to the payment provider and back."
                    : "No payment credentials — this publishes in labelled demo mode."}
                </span>
              </div>
              <div className="mt-4">
                <Button variant="ghost" size="sm" onClick={() => void navigate({ to: "/manage" })}>
                  Already published? Manage with your recovery code
                </Button>
              </div>
            </div>
          </div>

          <PresenceStatus core={core} columns={1} />
        </div>
      </div>
    </AppShell>
  );
}
