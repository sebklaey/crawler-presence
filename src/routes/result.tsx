import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, FileText, Sparkles } from "lucide-react";

import { AppShell, PageHead } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NO_GUARANTEE_NOTICE } from "@/lib/billing";
import { useFunnelOnce } from "@/lib/funnel";
import { entityLabel, generatedFiles, isCoreEmpty, presenceChecks, presenceScore } from "@/lib/knowledge";
import { useCore } from "@/lib/store";
import { Empty } from "./knowledge.index";

export const Route = createFileRoute("/result")({
  head: () => ({
    meta: [
      { title: "Your Knowledge Core is ready — Crawler" },
      {
        name: "description",
        content:
          "Review everything Crawler built from your interview — facts, offerings, FAQ, generated files and Presence score — for free, before you decide about hosting.",
      },
      { property: "og:title", content: "Your Knowledge Core is ready — Crawler" },
      {
        property: "og:description",
        content: "Check every generated file for free. Hosting is the only paid step.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResultPage,
});

function ResultPage() {
  const [core] = useCore();
  const empty = isCoreEmpty(core);
  const score = presenceScore(core);

  useFunnelOnce("knowledge_core_completed", {}, !empty);

  if (empty) return <Empty />;

  const files = generatedFiles(core);
  const checks = presenceChecks(core);
  const verified = core.facts.filter((f) => f.status === "verified");
  const claimed = core.facts.filter((f) => f.status !== "verified");
  const offerings = core.items.filter((i) => i.kind === "offering");
  const services = core.items.filter((i) => i.kind === "service");
  const projects = core.items.filter((i) => i.kind === "project");

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow={entityLabel[core.entityType]}
          title="Your Knowledge Core is ready."
          description="You can review all content for free. With Crawler hosting you publish this Knowledge Core permanently as an AI-readable Presence."
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Card>
              <h2 className="text-sm font-medium">Name and positioning</h2>
              <p className="display mt-2 text-3xl">{core.name || "Untitled presence"}</p>
              {core.tagline ? <p className="mt-1 text-sm text-muted-foreground">{core.tagline}</p> : null}
              {core.summary ? <p className="mt-4 text-[15px] leading-relaxed">{core.summary}</p> : null}
            </Card>

            <Card>
              <h2 className="text-sm font-medium">Confirmed facts</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {verified.length} confirmed · {claimed.length} still unconfirmed · positioning is kept separate.
              </p>
              {verified.length === 0 && claimed.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No facts captured yet.</p>
              ) : (
                <ul className="mt-4 divide-y divide-border">
                  {[...verified, ...claimed].slice(0, 10).map((f) => (
                    <li key={f.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">{f.label}</div>
                        <div className="text-sm">{f.value}</div>
                      </div>
                      <Badge variant="outline">{f.status === "verified" ? "Confirmed" : "Unconfirmed"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {core.stories.length ? (
              <Card>
                <h2 className="text-sm font-medium">Positioning</h2>
                <ul className="mt-3 space-y-3">
                  {core.stories.map((s) => (
                    <li key={s.id}>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {s.label}
                        <Badge variant="outline">{s.confirmed ? "Confirmed" : "Draft"}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {offerings.length || services.length || projects.length ? (
              <Card>
                <h2 className="text-sm font-medium">Offerings, services and projects</h2>
                <ul className="mt-3 divide-y divide-border">
                  {[...offerings, ...services, ...projects].slice(0, 12).map((i) => (
                    <li key={i.id} className="py-2.5">
                      <div className="text-sm font-medium">{i.name}</div>
                      <div className="text-sm text-muted-foreground">{i.summary}</div>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {core.faqs.length ? (
              <Card>
                <h2 className="text-sm font-medium">FAQ</h2>
                <ul className="mt-3 space-y-3">
                  {core.faqs.slice(0, 8).map((f) => (
                    <li key={f.id}>
                      <div className="text-sm font-medium">{f.question}</div>
                      <div className="text-sm text-muted-foreground">{f.answer}</div>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card>
              <h2 className="text-sm font-medium">Generated file formats</h2>
              <ul className="mt-3 grid gap-1.5 font-mono text-xs text-muted-foreground sm:grid-cols-2">
                {files.map((f) => (
                  <li key={f.path} className="flex items-center gap-2 break-all">
                    <FileText className="h-3 w-3 shrink-0" /> /{f.path}
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h2 className="text-sm font-medium">Before and after</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-dashed border-border p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Before</div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Scattered information, differing descriptions and possible AI misinterpretation.
                  </p>
                </div>
                <div className="rounded-xl border border-foreground p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">After</div>
                  <p className="mt-2 text-sm">
                    One maintained, structured and AI-readable Knowledge Core with clear facts and standardised files.
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{NO_GUARANTEE_NOTICE}</p>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Presence score</div>
              <div className="display mt-1 text-4xl tabular-nums">{score}%</div>
              <div className="mt-4 h-px w-full bg-border">
                <div className="h-px bg-foreground transition-all duration-700" style={{ width: `${score}%` }} />
              </div>
              <ul className="mt-4 space-y-1.5">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-center gap-2 text-sm">
                    <Check className={`h-3.5 w-3.5 ${c.done ? "" : "opacity-25"}`} />
                    <span className={c.done ? "" : "text-muted-foreground"}>{c.label}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h2 className="text-sm font-medium">Public Presence preview</h2>
              <div className="mt-3 rounded-xl border border-border bg-secondary/50 p-4">
                <div className="font-mono text-[11px] text-muted-foreground">crawler.today/p/…</div>
                <div className="mt-2 text-sm font-medium">{core.name || "Your Presence"}</div>
                <p className="text-xs text-muted-foreground">{core.tagline || core.summary?.slice(0, 90) || "—"}</p>
                <ul className="mt-3 space-y-0.5 font-mono text-[10px] text-muted-foreground">
                  {files.slice(0, 4).map((f) => (
                    <li key={f.path} className="break-all">
                      /{f.path}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-5 grid gap-2">
                <Button asChild>
                  <Link to="/publish">
                    <Sparkles className="mr-2 h-4 w-4" /> Publish Presence
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/preview">View files</Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/knowledge">
                    Edit content <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Reviewing is free. Hosting starts at $5/month —{" "}
                <Link to="/pricing" className="underline underline-offset-4">
                  see plans
                </Link>
                .
              </p>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-6">{children}</section>;
}
