import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { KeyRound, Loader2, Power } from "lucide-react";
import { toast } from "sonner";

import { AppShell, PageHead } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { teamSetStatusFn, teamSignInFn, type TeamSession } from "@/lib/team.functions";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Team access — Crawler" },
      {
        name: "description",
        content:
          "Open a shared Crawler Presence with a team code: measured analytics and, for editors, taking the Presence online or offline. No account needed.",
      },
      { property: "og:title", content: "Team access — Crawler" },
      { property: "og:description", content: "Shared, accountless access to a published Crawler Presence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

const REASONS: Record<string, string> = {
  "invalid-code": "That does not look like a Crawler team code. It has the form slug~tm_…",
  "not-found": "This team code is unknown or was revoked.",
  "rate-limited": "Too many attempts. Wait a minute and try again.",
  unavailable: "Crawler is temporarily unavailable. Please try again in a moment.",
  role: "Your team code is view-only, so it cannot change the public status.",
};

type Session = Extract<TeamSession, { ok: true }>;

function TeamPage() {
  const [code, setCode] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = useServerFn(teamSignInFn);
  const setStatus = useServerFn(teamSetStatusFn);

  async function open() {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const result = await signIn({ data: { code } });
      if (!result.ok) {
        setSession(null);
        toast.error(REASONS[result.reason] ?? "Could not open this Presence.");
        return;
      }
      setSession(result);
    } catch {
      toast.error("Could not open this Presence.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    if (!session) return;
    const next = session.status === "live" ? "offline" : "live";
    setBusy(true);
    try {
      const result = await setStatus({ data: { code, status: next } });
      if (!result.ok) {
        toast.error(REASONS[result.reason ?? ""] ?? "Could not change the status.");
        return;
      }
      setSession({ ...session, status: next });
      toast.success(next === "live" ? "Presence is online." : "Presence is offline.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Business"
          title="Team access"
          description="A team code gives colleagues shared access to one published Presence — analytics for everyone, online/offline for editors. No login, no account, and no access to billing or the owner recovery code."
        />

        <div className="rounded-2xl border border-border bg-card p-5">
          <label className="text-xs text-muted-foreground" htmlFor="team-code">
            Team code
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              id="team-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void open()}
              placeholder="your-presence~tm_…"
              className="h-10 max-w-md flex-1 font-mono text-sm"
              autoComplete="off"
            />
            <Button onClick={() => void open()} disabled={busy || !code.trim()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Open
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The Presence owner issues and revokes team codes under Manage. Each code is shown once.
          </p>
        </div>

        {session ? (
          <div className="fade-up mt-6 space-y-4">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="display text-2xl">{session.name}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    /p/{session.slug} · {session.plan} plan · signed in as “{session.label}” ({session.role})
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {session.status === "live" ? "Online" : "Offline"}
                  </span>
                  {session.role === "editor" ? (
                    <Button size="sm" variant="outline" onClick={() => void toggle()} disabled={busy}>
                      <Power className="mr-1.5 h-3.5 w-3.5" />
                      {session.status === "live" ? "Take offline" : "Put online"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            {session.analytics ? (
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="text-sm font-medium">
                  Measured analytics · last {session.analytics.windowDays} days
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Measured inside Crawler only. Crawler has no access to private ChatGPT, Claude, Gemini or other
                  assistant conversations.
                </p>
                <dl className="mt-5 grid gap-4 sm:grid-cols-4">
                  {session.analytics.metrics.map((metric) => (
                    <div key={metric.label}>
                      <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                      <dd className="display text-2xl">{metric.value.toLocaleString("en-US")}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="text-sm font-medium">Public files</div>
              <ul className="mt-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                {session.paths.map((path) => (
                  <li key={path}>
                    <a className="hover:text-foreground" href={`/p/${session.slug}/${path}`}>
                      /p/{session.slug}/{path}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
