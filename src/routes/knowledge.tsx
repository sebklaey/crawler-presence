import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { useSessionSync } from "@/hooks/use-session-sync";
import { completenessScore, attentionCount } from "@/lib/kc/model";
import { useCore, useProposals } from "@/lib/store";

export const Route = createFileRoute("/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge Core — Crawler" },
      {
        name: "description",
        content:
          "Edit your Knowledge Core with ChatGPT: add new developments, remove outdated information and publish only what you confirmed.",
      },
      { property: "og:title", content: "Knowledge Core editor — Crawler" },
      {
        property: "og:description",
        content: "One structured Knowledge Core. Verified facts stay separate from storytelling. You confirm every change.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KnowledgeLayout,
});

const tabs = [
  { to: "/knowledge", label: "Overview", exact: true },
  { to: "/knowledge/assistant", label: "Update with ChatGPT" },
  { to: "/knowledge/data", label: "Edit data" },
  { to: "/knowledge/sources", label: "Sources" },
  { to: "/knowledge/changes", label: "Changes" },
  { to: "/knowledge/history", label: "History" },
  { to: "/knowledge/publish", label: "Publication" },
] as const;

function KnowledgeLayout() {
  useSessionSync();
  const [core] = useCore();
  const [proposals] = useProposals();
  const pending = proposals.filter((p) => p.state === "pending").length;
  const score = completenessScore(core);
  const attention = attentionCount(core);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-5 pb-24 pt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Knowledge Core</div>
            <h1 className="display mt-2 text-3xl sm:text-4xl">{core.name || "Your Knowledge Core"}</h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline">{score}% complete</Badge>
            {attention > 0 ? <Badge variant="secondary">{attention} need attention</Badge> : null}
            {pending > 0 ? <Badge>{pending} open proposals</Badge> : null}
          </div>
        </div>

        <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-border pb-px">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              activeOptions={{ exact: "exact" in t ? t.exact : false }}
              className="whitespace-nowrap rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "border-foreground text-foreground" }}
            >
              {t.label}
              {t.to === "/knowledge/changes" && pending > 0 ? (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                  {pending}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="pt-8">
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
