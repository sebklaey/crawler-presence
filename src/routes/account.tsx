import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell, PageHead } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { claimDraft, getAccountOverview } from "@/lib/account.functions";
import { createPortalSession, getMySubscription } from "@/lib/payments.functions";
import { currentPaymentEnvironment, paymentsAvailable } from "@/lib/stripe";
import { planById, type PlanId } from "@/lib/billing";
import { useCore } from "@/lib/store";
import type { KnowledgeCore } from "@/lib/knowledge";

export const Route = createFileRoute("/account")({
  validateSearch: (s: Record<string, unknown>): { claim?: string } => ({
    ...(typeof s["claim"] === "string" ? { claim: s["claim"] as string } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Account — Crawler" },
      {
        name: "description",
        content: "Your Crawler account: linked drafts, published Presences, subscription and billing.",
      },
      { property: "og:title", content: "Account — Crawler" },
      { property: "og:description", content: "Ownership, recovery and billing for your AI-readable Presence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { claim } = Route.useSearch();
  const { loading, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [, setCore] = useCore();
  const [portalBusy, setPortalBusy] = useState(false);
  const env = currentPaymentEnvironment();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth", search: { next: "/account" }, replace: true });
  }, [loading, user, navigate]);

  const overview = useQuery({
    queryKey: ["account-overview"],
    enabled: Boolean(user),
    queryFn: () => getAccountOverview(),
  });

  const subscription = useQuery({
    queryKey: ["subscription", env],
    enabled: Boolean(user) && Boolean(env),
    queryFn: () => getMySubscription({ data: { environment: env! } }),
  });

  useEffect(() => {
    if (!user || !claim) return;
    void (async () => {
      const result = await claimDraft({ data: { token: claim } });
      if (result.ok) {
        if (result.core) setCore(result.core as KnowledgeCore);
        toast.success("Draft linked to your account.");
        void queryClient.invalidateQueries({ queryKey: ["account-overview"] });
      } else {
        toast.error(
          result.reason === "owned-by-other"
            ? "That draft already belongs to another account."
            : "That draft could not be linked.",
        );
      }
      void navigate({ to: "/account", replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, claim]);

  async function openPortal() {
    if (!env) return;
    setPortalBusy(true);
    const result = await createPortalSession({
      data: { environment: env, returnUrl: `${window.location.origin}/account` },
    });
    setPortalBusy(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener");
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/", replace: true });
  }

  if (loading || !user) {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-5 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your account…
        </div>
      </AppShell>
    );
  }

  const sub = subscription.data;
  const plan = sub?.plan ? planById(sub.plan as PlanId) : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-5 pb-24 pt-14">
        <PageHead eyebrow="Account" title="Your Crawler account" description={user.email ?? undefined} />

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="text-sm font-medium">Subscription</div>
            {!paymentsAvailable() ? (
              <p className="mt-3 rounded-lg border border-dashed border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                <strong className="text-foreground">Test mode.</strong> No payment client token in this build, so
                checkout is unavailable and publishing stays in labelled demo mode.
              </p>
            ) : sub?.active ? (
              <>
                <p className="mt-2 text-sm">
                  {plan?.name ?? "Active plan"} — ${plan?.price ?? "—"}/month
                  {sub.cancelAtPeriodEnd ? " (cancels at period end)" : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Status {sub.status}
                  {sub.currentPeriodEnd ? ` · renews ${new Date(sub.currentPeriodEnd).toLocaleDateString()}` : ""}
                  {env === "sandbox" ? " · test environment" : ""}
                </p>
                <Button variant="outline" className="mt-4" disabled={portalBusy} onClick={() => void openPortal()}>
                  {portalBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Manage billing
                </Button>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  No active subscription. Creating and previewing stays free — you only pay to be online.
                </p>
                <Button asChild className="mt-4">
                  <Link to="/publish">Choose a plan</Link>
                </Button>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="text-sm font-medium">Session</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Signed in with Google. The public MCP endpoint never receives this identity — drafts started in ChatGPT
              are linked here explicitly.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => void signOut()}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="text-sm font-medium">Linked drafts</div>
            {overview.data?.drafts.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {overview.data.drafts.map((d) => (
                  <li key={d.token} className="flex items-center justify-between gap-3">
                    <span className="truncate">{d.name}</span>
                    <Link
                      to="/publish"
                      search={{ session: d.token }}
                      className="shrink-0 text-xs underline underline-offset-4"
                    >
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No drafts linked yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="text-sm font-medium">Published presences</div>
            {overview.data?.presences.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {overview.data.presences.map((p) => (
                  <li key={p.slug} className="flex items-center justify-between gap-3">
                    <span className="truncate">
                      {p.name}
                      <span className="ml-2 text-[11px] uppercase tracking-wide text-muted-foreground">{p.mode}</span>
                    </span>
                    <a href={`/p/${p.slug}`} className="shrink-0 text-xs underline underline-offset-4">
                      <ExternalLink className="inline h-3 w-3" /> View
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Nothing published yet.</p>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
