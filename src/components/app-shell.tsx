import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { usePublishState } from "@/hooks/use-publish-state";
import type { ReactNode } from "react";

const nav = [
  { to: "/", label: "Interview" },
  { to: "/knowledge", label: "Knowledge Core" },
  { to: "/preview", label: "Preview" },
  { to: "/analytics", label: "Analytics" },
  { to: "/pricing", label: "Pricing" },
  { to: "/manage", label: "Manage" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { isLive, hasChanges } = usePublishState();
  // No pending dot once everything that exists locally is already live.
  const showDot = !isLive || hasChanges;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5">
          <Link to="/" className="display text-xl">
            Crawler
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeOptions={{ exact: n.to === "/" }}
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span className="hidden lg:inline">Creation &amp; preview are free · no account</span>
            <Button
              asChild
              size="sm"
              className="gap-2 rounded-full bg-cta px-5 py-2 text-sm font-medium text-cta-foreground shadow-sm transition-colors hover:bg-cta/90"
            >
              <Link to="/publish">
                {showDot ? (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cta-foreground opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-cta-foreground" />
                  </span>
                ) : null}
                Publish
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto border-t border-border/70 px-5 py-2 md:hidden">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="whitespace-nowrap rounded-md px-2.5 py-1 text-xs text-muted-foreground"
              activeOptions={{ exact: n.to === "/" }}
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {n.label}
            </Link>
          ))}
        </div>
      </header>
      <main>{children}</main>
      <footer className="mx-auto mt-24 max-w-6xl border-t border-border/70 px-5 py-10 text-xs text-muted-foreground">
        <p>
          Crawler builds AI-readable presences. It measures activity inside Crawler and on your published
          files only — never private conversations in ChatGPT, Claude, Gemini or other assistants.
        </p>
        <p className="mt-2">
          Crawler is a digital software subscription operated by SEBKLAEY and delivered online. No physical goods are
          sold, shipped or delivered.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>© {new Date().getFullYear()} SEBKLAEY</span>
          <Link to="/terms" className="hover:text-foreground">Terms &amp; Conditions</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy Notice</Link>
          <Link to="/refunds" className="hover:text-foreground">Refund Policy</Link>
          <Link to="/support" className="hover:text-foreground">Support</Link>
          <Link to="/team" className="hover:text-foreground">Team access</Link>

          <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
        </div>
      </footer>

    </div>
  );
}

export function PageHead({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string | undefined;
  title: string;
  description?: string | undefined;
}) {
  return (
    <div className="mb-10">
      {eyebrow ? (
        <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
      ) : null}
      <h1 className="display text-4xl sm:text-5xl">{title}</h1>
      {description ? <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
