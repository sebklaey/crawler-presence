import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CreditCard, Eye, EyeOff, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { AppShell, PageHead } from "@/components/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AiRetrievalSection, ApiAccessSection, CustomDomainSection } from "@/components/manage-sections";
import { TeamAndReportsSection } from "@/components/team-sections";
import { RetentionSection } from "@/components/retention-sections";

import { RecoveryCodeCard } from "@/components/recovery-code-card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  manageBillingPortalFn,
  manageOverviewFn,
  manageRotateSecretFn,
  manageRestoreCoreFn,
  manageSetStatusFn,
  manageUpdateCoreFn,
  type ManageOverview,
} from "@/lib/manage.functions";
import { useCore, usePlan, usePublished, useRecoveryCode } from "@/lib/store";
import { isCoreEmpty, type KnowledgeCore } from "@/lib/knowledge";

export const Route = createFileRoute("/manage")({
  head: () => ({
    meta: [
      { title: "Manage your Presence — Crawler" },
      {
        name: "description",
        content:
          "Open your published Crawler Presence with its recovery code: take it offline, put it back online, rotate the code or manage the subscription. No account, no login.",
      },
      { property: "og:title", content: "Manage your Presence — Crawler" },
      {
        property: "og:description",
        content: "Accountless Presence management with a one-time recovery code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagePage,
});

const REASONS: Record<string, string> = {
  "invalid-code": "That does not look like a Crawler recovery code. It has the form slug~crw_…",
  "not-found": "No Presence matches this recovery code.",
  "rate-limited": "Too many attempts. Wait a minute and try again.",
  "no-subscription": "This Presence has no subscription — it was published in demo mode.",
  unavailable:
    "The Crawler database is temporarily unavailable, so nothing was changed. Please try again in a moment.",
};

type Confirming = "offline" | "rotate" | null;

function ManagePage() {
  const [code, setCode] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Extract<ManageOverview, { ok: true }> | null>(null);
  const [rotated, setRotated] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [core, setCore] = useCore();
  const [, setPlan] = usePlan();
  const [, setPublished] = usePublished();
  const [, setStoredCode] = useRecoveryCode();

  /**
   * Pull the owner's real data into the browser workspace so /knowledge,
   * /preview, /analytics and /publish show this Presence, not an empty draft.
   */
  async function restoreWorkspace(next: string) {
    try {
      const restored = await manageRestoreCoreFn({ data: { code: next } });
      if (!restored.ok) return;
      const remote = restored.core as KnowledgeCore;
      // Never overwrite a filled local draft with an empty published shell —
      // that would block "Publish current content".
      if (!isCoreEmpty(remote) || isCoreEmpty(core)) setCore(remote);
      setPlan(restored.plan as "free" | "plus" | "pro" | "business");
      setPublished({ at: restored.publishedAt, slug: restored.slug });
      setStoredCode(next);

    } catch {
      /* the overview already loaded — restoring the workspace is best effort */
    }
  }

  async function open(next = code) {
    setBusy(true);
    try {
      const result = await manageOverviewFn({ data: { code: next } });
      if (!result.ok) {
        setData(null);
        toast.error(REASONS[result.reason] ?? "Could not open that Presence.");
        return;
      }
      setData(result);
      await restoreWorkspace(next);
      toast.success("Presence data loaded into Knowledge, Preview, Analytics and Publish.");
    } catch {
      toast.error("Could not open that Presence.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "live" | "offline") {
    setBusy(true);
    try {
      const result = await manageSetStatusFn({ data: { code, status } });
      if (!result.ok) {
        toast.error(REASONS[result.reason ?? ""] ?? "That did not work.");
        return;
      }
      toast.success(status === "offline" ? "Presence taken offline." : "Presence is online again.");
      await open();
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    setBusy(true);
    try {
      const result = await manageRotateSecretFn({ data: { code } });
      if (!result.ok || !result.recoveryCode) {
        toast.error(REASONS[result.reason ?? ""] ?? "Could not rotate the code.");
        return;
      }
      setRotated(result.recoveryCode);
      setCode(result.recoveryCode);
      toast.success("New recovery code issued. The old one no longer works.");
      await open(result.recoveryCode);
    } finally {
      setBusy(false);
    }
  }

  const liveIsEmpty = !data?.name;

  async function updateContent() {
    setBusy(true);
    try {
      const result = await manageUpdateCoreFn({ data: { code, core } });
      if (!result.ok) {
        toast.error(
          result.reason === "empty-core"
            ? "There is no Knowledge Core content in this browser yet."
            : (REASONS[result.reason ?? ""] ?? "Could not publish the update."),
        );
        return;
      }
      toast.success("Published. Your public files were regenerated.");
      await open();
    } finally {
      setBusy(false);
    }
  }

  async function billing() {
    setBusy(true);
    try {
      const result = await manageBillingPortalFn({
        data: { code, returnUrl: `${window.location.origin}/manage` },
      });
      if (!result.ok || !result.url) {
        toast.error(REASONS[result.reason ?? ""] ?? result.reason ?? "Billing portal unavailable.");
        return;
      }
      window.location.href = result.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Accountless ownership"
          title="Manage your Presence"
          description="Crawler has no accounts, no login and no registration. Your recovery code is your ownership — paste it here to manage the Presence it belongs to."
        />

        <div className="rounded-2xl border border-border bg-card p-6">
          <label htmlFor="recovery-code" className="text-sm font-medium">
            Recovery code
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            You received it once, right after publishing. Format: <code className="font-mono">slug~crw_…</code>
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              id="recovery-code"
              type={reveal ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="my-presence-1a2b3c~crw_… (64 hex characters)"
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={reveal ? "Hide the recovery code" : "Show the recovery code"}
              onClick={() => setReveal((v) => !v)}
            >
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button disabled={busy || code.trim().length < 10} onClick={() => void open()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Open
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Lost the code? It cannot be recovered — Crawler stores only a one-way hash of it and has no other way to
            identify you.
          </p>
        </div>

        {rotated ? (
          <div className="mt-6">
            <RecoveryCodeCard code={rotated} slug={data?.slug ?? ""} />
          </div>
        ) : null}

        {data ? (
          <div className="mt-6 space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Presence</div>
                  <div className="display mt-1 text-2xl">{data.name}</div>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                    data.status === "live" ? "border-foreground text-foreground" : "border-border text-muted-foreground"
                  }`}
                >
                  {data.status === "live" ? "Online" : "Offline"}
                </span>
              </div>

              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Public address</dt>
                  <dd>
                    <a href={`/p/${data.slug}`} className="break-all underline underline-offset-4">
                      /p/{data.slug}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Plan</dt>
                  <dd className="capitalize">
                    {data.plan} {data.mode === "demo" ? "(beta publication, no charge)" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Published</dt>
                  <dd>{new Date(data.publishedAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Subscription</dt>
                  <dd>
                    {data.subscriptionStatus ?? (data.mode === "demo" ? "none (beta publication)" : "pending")}
                    {data.currentPeriodEnd
                      ? ` · renews ${new Date(data.currentPeriodEnd).toLocaleDateString()}`
                      : ""}
                  </dd>
                </div>
              </dl>

              <ul className="mt-5 grid gap-1 font-mono text-[11px] text-muted-foreground sm:grid-cols-2">
                {data.paths.map((path) => (
                  <li key={path}>
                    <a className="break-all hover:text-foreground" href={`/p/${data.slug}/${path}`}>
                      /p/{data.slug}/{path}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-sm font-medium">Controls</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {data.status === "live" ? (
                  <Button variant="outline" disabled={busy} onClick={() => setConfirming("offline")}>
                    Take offline
                  </Button>
                ) : (
                  <Button disabled={busy} onClick={() => void setStatus("live")}>
                    Put back online
                  </Button>
                )}
                <Button variant="outline" disabled={busy} onClick={() => setConfirming("rotate")}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" /> Rotate recovery code
                </Button>
                {data.billingPortalAvailable ? (
                  <Button variant="outline" disabled={busy} onClick={() => void billing()}>
                    <CreditCard className="mr-2 h-3.5 w-3.5" /> Subscription &amp; invoices
                  </Button>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Taking a Presence offline stops serving every public file immediately. Rotating issues a brand-new code
                and invalidates the current one — the new code is shown once.
              </p>
            </div>

            {data.restricted || data.hiddenCatalogEntries > 0 ? (
              <div className="rounded-2xl border border-border bg-muted/40 p-6 text-sm">
                {data.restricted ? (
                  <p>
                    <span className="font-medium">Restricted mode.</span> Your subscription is{" "}
                    {data.subscriptionStatus ?? "inactive"}, so this Presence stays online and publicly readable, but
                    analytics and editing are locked until billing is active again.
                  </p>
                ) : null}
                {data.hiddenCatalogEntries > 0 ? (
                  <p className={data.restricted ? "mt-3" : undefined}>
                    <span className="font-medium">
                      {data.hiddenCatalogEntries} content {data.hiddenCatalogEntries === 1 ? "record is" : "records are"}{" "}
                      hidden.
                    </span>{" "}
                    Your {data.plan} plan hosts up to {data.catalogLimit.toLocaleString()} AI-readable content records. The rest stay
                    stored and reappear automatically after an upgrade.
                  </p>
                ) : null}
              </div>
            ) : null}

            {data.analytics ? (
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-medium">
                    Presence analytics · last {data.analytics.windowDays} days
                  </h2>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {data.analytics.mode === "measured" ? "Measured" : "No events yet"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {data.analytics.mode === "measured"
                    ? "Measured inside Crawler: anonymous Crawler sessions that referenced this Presence, and observable reads of your public files."
                    : "Nothing measured in this window yet. Numbers appear as soon as Crawler references this Presence or its public files are read — Crawler never shows demo numbers here."}{" "}
                  Crawler has no access to private ChatGPT, Claude, Gemini or other assistant conversations.
                </p>



                <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                  {data.analytics.metrics.map((metric) => (
                    <div key={metric.label}>
                      <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                      <dd className="display text-2xl">{metric.value.toLocaleString()}</dd>
                      <p className="text-[11px] text-muted-foreground">{metric.hint}</p>
                    </div>
                  ))}
                </dl>

                <div className="mt-6 grid gap-6 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Most asked about</div>
                    <ul className="mt-2 space-y-1 text-sm">
                      {data.analytics.topQuestions.map((q) => (
                        <li key={q.label} className="flex justify-between gap-3">
                          <span>{q.label}</span>
                          <span className="font-mono text-xs text-muted-foreground">{q.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Missing information</div>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {data.analytics.gaps.map((gap) => (
                        <li key={gap}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <a
                  href="/analytics"
                  className="mt-6 inline-block rounded-full border border-border px-4 py-1.5 text-xs hover:border-foreground/40"
                >
                  Open AI Visibility Analytics
                </a>
              </div>

            ) : null}

            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-sm font-medium">Published content</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                {liveIsEmpty
                  ? "This Presence is online but has no content yet, so AI systems find an empty shell. Fill in your Knowledge Core under /knowledge, then publish the update here."
                  : "Your Presence currently serves the Knowledge Core below. Edit it under /knowledge and publish the update here — the public files are regenerated immediately."}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button disabled={busy || isCoreEmpty(core)} onClick={() => void updateContent()}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Publish current content
                </Button>
                <a href="/knowledge" className="text-xs underline underline-offset-4">
                  Edit Knowledge Core
                </a>
              </div>
              {isCoreEmpty(core) ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  This browser holds no Knowledge Core content yet — add it under /knowledge first.
                </p>
              ) : null}
            </div>

            <AiRetrievalSection data={data} />
            <CustomDomainSection code={code} data={data} refresh={() => open()} />
            <ApiAccessSection data={data} />
            <RetentionSection code={code} />
            <TeamAndReportsSection code={code} plan={data.plan} />




          </div>
        ) : null}

        <AlertDialog open={confirming !== null} onOpenChange={(open) => (open ? null : setConfirming(null))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirming === "rotate" ? "Rotate the recovery code?" : "Take this Presence offline?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirming === "rotate" ? (
                  <>
                    A brand-new recovery code is issued and the current one stops working immediately. The new code is
                    shown exactly once — if you do not save it, the Presence can never be managed again. Anyone still
                    holding the old code loses access.
                  </>
                ) : (
                  <>
                    Every public file (llms.txt, the markdown pages and the JSON endpoints) stops being served right
                    away and starts returning 404 for AI crawlers and visitors. The Presence and its content are kept —
                    you can put it back online at any time with this recovery code.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const action = confirming;
                  setConfirming(null);
                  if (action === "rotate") void rotate();
                  if (action === "offline") void setStatus("offline");
                }}
              >
                {confirming === "rotate" ? "Rotate code" : "Take offline"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppShell>
  );
}
