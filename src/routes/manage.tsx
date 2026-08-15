import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CreditCard, Eye, EyeOff, KeyRound, Loader2, LogOut, RefreshCw } from "lucide-react";
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
import { ApiAccessSection, CustomDomainSection } from "@/components/manage-sections";
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
import { useCore, usePlan, usePublished } from "@/lib/store";
import { useManageSession } from "@/hooks/use-manage-session";
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
  "invalid-code":
    "That is not a Crawler recovery code. A ChatGPT session ID (sess_…) is a different capability and can never manage a Presence.",
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
  const session = useManageSession();
  const [rotateCode, setRotateCode] = useState("");
  const autoOpened = useRef(false);

  /**
   * Pull the owner's real data into the browser workspace so /knowledge,
   * /preview, /analytics and /publish show this Presence, not an empty draft.
   */
  async function restoreWorkspace() {
    try {
      const restored = await manageRestoreCoreFn();
      if (!restored.ok) return;
      const remote = restored.core as KnowledgeCore;
      // Never overwrite a filled local draft with an empty published shell —
      // that would block "Publish current content".
      if (!isCoreEmpty(remote) || isCoreEmpty(core)) setCore(remote);
      setPlan(restored.plan as "free" | "plus" | "pro" | "business");
      setPublished({ at: restored.publishedAt, slug: restored.slug });

    } catch {
      /* the overview already loaded — restoring the workspace is best effort */
    }
  }

  /**
   * Opens (or refreshes) the management view.
   *
   * When a raw recovery code is supplied it is exchanged once for the HttpOnly
   * management cookie and then wiped from React memory — every later call is
   * authorised by that cookie alone.
   */
  async function open(next = code, opts?: { silent?: boolean }) {
    setBusy(true);
    try {
      if (next && next.trim().length >= 10) {
        const { openManageSession } = await import("@/lib/manage-session");
        const opened = await openManageSession(next.trim());
        // The capability has done its one job: forget it immediately.
        setCode("");
        if (!opened.ok) {
          setData(null);
          if (!opts?.silent) toast.error(REASONS[opened.reason] ?? "Could not open that Presence.");
          return;
        }
      }
      const result = await manageOverviewFn();
      if (!result.ok) {
        setData(null);
        // An expired or missing management cookie must not keep the page open.
        if (opts?.silent && (result.reason === "unauthenticated" || result.reason === "not-found")) {
          session.invalidate();
          return;
        }
        if (!opts?.silent) toast.error(REASONS[result.reason] ?? "Could not open that Presence.");
        return;
      }
      setData(result);
      await restoreWorkspace();
      if (!opts?.silent)
        toast.success("Presence data loaded into Knowledge, Preview, Analytics and Publish.");
    } catch {
      if (!opts?.silent) toast.error("Could not open that Presence.");
    } finally {
      setBusy(false);
    }
  }

  /** Stay unlocked while the HttpOnly management cookie is still valid. */
  useEffect(() => {
    if (!session.ready || autoOpened.current) return;
    autoOpened.current = true;
    if (session.active) void open("", { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.ready, session.active]);

  /**
   * Coming back from a checkout must show the new plan at once: whenever this
   * tab regains focus, the Presence is silently reloaded (server-side it also
   * reconciles the subscription with the payment provider).
   */
  const lastRefresh = useRef(0);
  useEffect(() => {
    if (!data?.ok) return;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastRefresh.current < 5000) return;
      lastRefresh.current = Date.now();
      void open(code, { silent: true });
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.ok, code]);


  function signOut() {
    void session.close();
    setData(null);
    setCode("");
    setRotated(null);
    autoOpened.current = true;
    toast.success("Management session closed on this device.");
  }


  async function setStatus(status: "live" | "offline") {
    setBusy(true);
    try {
      const result = await manageSetStatusFn({ data: { status } });
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

  /** Rotation re-confirms ownership with the independent recovery code. */
  async function rotate(confirmCode: string) {
    if (confirmCode.trim().length < 10) {
      toast.error("Enter your current recovery code to confirm the rotation.");
      return;
    }
    setBusy(true);
    try {
      const result = await manageRotateSecretFn({ data: { code: confirmCode.trim() } });
      if (!result.ok || !result.recoveryCode) {
        toast.error(REASONS[result.reason ?? ""] ?? "Could not rotate the code.");
        return;
      }
      setRotated(result.recoveryCode);
      setRotateCode("");
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
      const result = await manageUpdateCoreFn({ data: { core } });
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
        data: { returnUrl: `${window.location.origin}/manage` },
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
            You received it once, right after publishing. It is an independent management capability — your ChatGPT
            session ID (<code className="font-mono">sess_…</code>) is a different capability and is never accepted here.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              id="recovery-code"
              type={reveal ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="sess_… (your session ID) or legacy slug~crw_…"
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
          {data ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
              <p className="text-xs text-muted-foreground">
                Unlocked in this browser — Knowledge, Preview, Analytics and Publish stay open until you remove the
                code.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Lock again
              </Button>
            </div>
          ) : null}
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
                  <dt className="text-xs text-muted-foreground">Session ID</dt>
                  <dd>
                    {data.sessionToken ? (
                      <code className="break-all font-mono text-[11px]">{data.sessionToken}</code>
                    ) : (
                      <span className="text-muted-foreground">Not linked to a ChatGPT session</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Published</dt>
                  <dd>
                    {new Date(data.publishedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </dd>
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
                    Your {data.plan} plan hosts up to {data.catalogLimit.toLocaleString("en-US")} AI-readable content records. The rest stay
                    stored and reappear automatically after an upgrade.
                  </p>
                ) : null}
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

            
            <CustomDomainSection data={data} refresh={() => open()} />
            <ApiAccessSection data={data} />
            <RetentionSection />
            <TeamAndReportsSection plan={data.plan} />




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
                    you can put it back online at any time from this management session.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {confirming === "rotate" ? (
              <Input
                value={rotateCode}
                onChange={(e) => setRotateCode(e.target.value)}
                type="password"
                autoComplete="off"
                placeholder="Current recovery code"
                aria-label="Current recovery code"
                className="font-mono text-xs"
              />
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const action = confirming;
                  setConfirming(null);
                  if (action === "rotate") void rotate(rotateCode);
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
