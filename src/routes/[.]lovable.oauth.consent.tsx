import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type AuthorizationDetails = {
  client?: { name?: string; client_name?: string; redirect_uri?: string } | null;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: unknown }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: unknown }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: unknown }>;
};

const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  validateSearch: (s: Record<string, unknown>): { authorization_id?: string } => ({
    ...(typeof s["authorization_id"] === "string" ? { authorization_id: s["authorization_id"] as string } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Authorize access — Crawler" },
      { name: "description", content: "Approve or deny an external client's access to your Crawler account." },
      { property: "og:title", content: "Authorize access — Crawler" },
      { property: "og:description", content: "OAuth consent for connecting Crawler to another application." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="mx-auto max-w-xl px-5 py-24 text-sm text-muted-foreground">
        Authorization failed: {String((error as Error)?.message ?? error)}
      </div>
    </AppShell>
  ),
  component: ConsentPage,
});

function ConsentPage() {
  const { authorization_id: authorizationId } = Route.useSearch();
  const { loading, user } = useAuth();
  const navigate = useNavigate();
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!authorizationId) {
      setMessage("Missing authorization request.");
      return;
    }
    if (!user) {
      const next = `${window.location.pathname}${window.location.search}`;
      void navigate({ to: "/auth", search: { next }, replace: true });
      return;
    }
    void (async () => {
      const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
      if (error) {
        setMessage("This authorization request is invalid or expired.");
        return;
      }
      const redirect = data?.redirect_url ?? data?.redirect_to;
      if (redirect && !data?.client) {
        window.location.href = redirect;
        return;
      }
      setDetails(data);
    })();
  }, [authorizationId, loading, user, navigate]);

  async function decide(approve: boolean) {
    if (!authorizationId) return;
    setBusy(true);
    const api = oauth();
    const { data, error } = approve
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (error) {
      setMessage("Could not complete the authorization.");
      setBusy(false);
      return;
    }
    const redirect = data?.redirect_url ?? data?.redirect_to;
    if (redirect) window.location.href = redirect;
    else setBusy(false);
  }

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "An external application";

  return (
    <AppShell>
      <div className="mx-auto max-w-lg px-5 pb-24 pt-20">
        <div className="rounded-2xl border border-border bg-card p-6">
          {message ? (
            <p className="text-sm text-muted-foreground">{message}</p>
          ) : !details ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading authorization request…
            </div>
          ) : (
            <>
              <h1 className="display text-2xl">Connect {clientName} to Crawler</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Signed in as {user?.email}. This lets {clientName} use Crawler as you.
              </p>
              {details.client?.redirect_uri ? (
                <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">
                  Redirect: {details.client.redirect_uri}
                </p>
              ) : null}
              <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                <li>· Share your basic profile</li>
                <li>· Share your email address</li>
                {details.scope
                  ? details.scope
                      .split(" ")
                      .filter((s) => !["openid", "email", "profile"].includes(s))
                      .map((s) => <li key={s}>· Additional permission requested: {s}</li>)
                  : null}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                This does not bypass Crawler's permissions or backend policies.
              </p>
              <div className="mt-6 flex gap-3">
                <Button disabled={busy} onClick={() => void decide(true)}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Approve
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => void decide(false)}>
                  Cancel connection
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
