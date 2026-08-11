import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell, PageHead } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth, safeNext } from "@/hooks/use-auth";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    ...(safeNext(s["next"]) ? { next: safeNext(s["next"]) as string } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Crawler" },
      {
        name: "description",
        content:
          "Sign in with Google to claim your Crawler draft, own your published Presence and unlock private analytics.",
      },
      { property: "og:title", content: "Sign in — Crawler" },
      { property: "og:description", content: "Account linking for ownership, recovery and private analytics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const { loading, user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) void navigate({ to: next ?? "/account", replace: true });
  }, [loading, user, next, navigate]);

  async function signIn() {
    setBusy(true);
    try {
      if (next) sessionStorage.setItem("crawler:next", next);
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Sign-in failed. Please try again.");
        setBusy(false);
        return;
      }
      if (result.redirected) return;
      void navigate({ to: next ?? "/account", replace: true });
    } catch {
      toast.error("Sign-in failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl px-5 pb-24 pt-20">
        <PageHead
          eyebrow="Account linking"
          title="Sign in to own your Presence"
          description="Everything in the interview stays free and anonymous. An account only becomes necessary when you want to keep a draft, publish it, or read private analytics."
        />
        <div className="rounded-2xl border border-border bg-card p-6">
          <Button onClick={() => void signIn()} disabled={busy || loading} className="w-full">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continue with Google
          </Button>
          <ul className="mt-6 space-y-2 text-xs text-muted-foreground">
            <li>· Ownership: your drafts and published Presences are tied to this account.</li>
            <li>· Recovery: pick a draft up on any device, including one started in ChatGPT.</li>
            <li>· Private analytics and subscription status stay behind this login.</li>
            <li>
              · The public MCP endpoint at <code className="font-mono">/mcp</code> stays unauthenticated and never sees
              your account identity.
            </li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
