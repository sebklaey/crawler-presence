import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell, PageHead } from "@/components/app-shell";
import { PresenceStatus } from "@/components/presence-status";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { improvePresence } from "@/lib/interview.functions";
import { entityLabel, isCoreEmpty } from "@/lib/knowledge";
import { useCore, usePlan } from "@/lib/store";

export const Route = createFileRoute("/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge Core — Crawler" },
      {
        name: "description",
        content: "One structured Knowledge Core: verified facts, positioning, catalog, FAQ and CV entries.",
      },
      { property: "og:title", content: "Knowledge Core — Crawler" },
      { property: "og:description", content: "Verified facts stay separate from storytelling. You confirm every claim." },
    ],
  }),
  component: KnowledgePage,
});

type Improvement = {
  headline: string;
  strengths: string[];
  missing: string[];
  suggestions: { title: string; why: string }[];
};

function KnowledgePage() {
  const [core, setCore] = useCore();
  const [plan] = usePlan();
  const [improving, setImproving] = useState(false);
  const [improvement, setImprovement] = useState<Improvement | null>(null);
  const improve = useServerFn(improvePresence);

  if (isCoreEmpty(core)) return <Empty />;

  const offerings = core.items.filter((i) => i.kind === "offering");
  const projects = core.items.filter((i) => i.kind === "project");
  const services = core.items.filter((i) => i.kind === "service");

  async function runImprove() {
    setImproving(true);
    try {
      setImprovement((await improve({ data: { core } })) as Improvement);
    } catch {
      toast.error("Could not analyse the presence right now.");
    } finally {
      setImproving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow={entityLabel[core.entityType]}
          title={core.name || "Untitled presence"}
          description={core.tagline || undefined}
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Section title="Summary">
              <p className="text-[15px] leading-relaxed">{core.summary || "—"}</p>
            </Section>

            <Section
              title="Facts"
              hint="Verified facts are what you confirmed. Claims are inferred and need your confirmation."
            >
              {core.facts.length === 0 ? (
                <Muted>No facts captured yet.</Muted>
              ) : (
                <ul className="divide-y divide-border">
                  {core.facts.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">{f.label}</div>
                        <div className="text-sm">{f.value}</div>
                      </div>
                      {f.status === "verified" ? (
                        <Badge variant="outline" className="gap-1">
                          <Check className="h-3 w-3" /> Verified
                        </Badge>
                      ) : (
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setCore({
                                ...core,
                                facts: core.facts.map((x) =>
                                  x.id === f.id ? { ...x, status: "verified" as const } : x,
                                ),
                              })
                            }
                          >
                            <Check className="mr-1 h-3 w-3" /> Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Remove fact: ${f.label}`}
                            onClick={() => setCore({ ...core, facts: core.facts.filter((x) => x.id !== f.id) })}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Positioning & story" hint="Interpretation, not fact. Confirm what you want published.">
              {core.stories.length === 0 ? (
                <Muted>Nothing drafted yet.</Muted>
              ) : (
                <ul className="space-y-4">
                  {core.stories.map((s) => (
                    <li key={s.id}>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">{s.label}</div>
                        {s.confirmed ? (
                          <Badge variant="outline">Confirmed</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setCore({
                                ...core,
                                stories: core.stories.map((x) => (x.id === s.id ? { ...x, confirmed: true } : x)),
                              })
                            }
                          >
                            Confirm
                          </Button>
                        )}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {[
              ["Offerings", offerings],
              ["Projects", projects],
              ["Services", services],
            ].map(([title, list]) =>
              (list as typeof offerings).length ? (
                <Section key={title as string} title={title as string}>
                  <ul className="divide-y divide-border">
                    {(list as typeof offerings).map((i) => (
                      <li key={i.id} className="py-3">
                        <div className="text-sm font-medium">{i.name}</div>
                        <div className="text-sm text-muted-foreground">{i.summary}</div>
                        {i.tags?.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {i.tags.map((t) => (
                              <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null,
            )}

            {core.faqs.length ? (
              <Section title="FAQ">
                <ul className="space-y-3">
                  {core.faqs.map((f) => (
                    <li key={f.id}>
                      <div className="text-sm font-medium">{f.question}</div>
                      <div className="text-sm text-muted-foreground">{f.answer}</div>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {core.cv.length ? (
              <Section title="CV">
                <ul className="space-y-2 text-sm">
                  {core.cv.map((e) => (
                    <li key={e.id}>
                      <span className="text-muted-foreground">{e.period}</span> {e.role}
                      {e.organization ? ` · ${e.organization}` : ""}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>

          <div className="space-y-6">
            <PresenceStatus core={core} compact />

            <Section title="Improve my Presence" hint={plan === "free" || plan === "plus" ? "Included from Pro." : undefined}>
              {core.gaps.length ? (
                <ul className="mb-4 space-y-1.5 text-sm text-muted-foreground">
                  {core.gaps.slice(0, 5).map((g) => (
                    <li key={g}>· {g}</li>
                  ))}
                </ul>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => void runImprove()} disabled={improving}>
                {improving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                Analyse gaps
              </Button>
              {improvement ? (
                <div className="mt-4 space-y-3 text-sm">
                  <p className="font-medium">{improvement.headline}</p>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Missing</div>
                    <ul className="mt-1 space-y-1 text-muted-foreground">
                      {improvement.missing.map((m) => (
                        <li key={m}>· {m}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Do next</div>
                    <ul className="mt-1 space-y-1.5">
                      {improvement.suggestions.map((s) => (
                        <li key={s.title}>
                          <span className="font-medium">{s.title}</span>
                          <span className="text-muted-foreground"> — {s.why}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </Section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string | undefined; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-sm font-medium">{title}</h2>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-muted-foreground">{children}</p>
);

export function Empty() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 py-32 text-center">
        <h1 className="display text-4xl">Nothing here yet.</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Start the interview and Crawler will build your Knowledge Core.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Tell Crawler what you do
        </Link>
      </div>
    </AppShell>
  );
}
