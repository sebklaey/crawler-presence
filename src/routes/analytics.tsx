import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { AppShell, PageHead } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyticsSummary, askAnalytics } from "@/lib/analytics.functions";
import {
  demoDays,
  demoEntities,
  demoMissing,
  demoSources,
  demoTopics,
  totals,
  windowRows,
} from "@/lib/demo-analytics";
import { usePlan } from "@/lib/store";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Crawler" },
      {
        name: "description",
        content: "Ask Crawler in plain language: conversations, product appearances, outbound clicks, referrers and crawler reads.",
      },
      { property: "og:title", content: "Analytics — Crawler" },
      { property: "og:description", content: "Only measurable signal. Never private ChatGPT, Claude or Gemini conversations." },
    ],
  }),
  component: AnalyticsPage,
});

const RANGES = [7, 30, 90] as const;
const INTENTS = [
  "Analytics last 7 days",
  "How many users talked about Product X?",
  "What are users asking about our gravel bikes?",
  "Which sources send the most traffic?",
];

type Answer = { intent: string; answer: string; metrics: { label: string; value: string }[]; caveat: string };
type Summary = {
  headline: string;
  recurringQuestions: string[];
  missingInformation: string[];
  improvements: { action: string; impact: string }[];
};

function AnalyticsPage() {
  const [plan] = usePlan();
  const maxDays = plan === "plus" ? 7 : plan === "free" ? 7 : plan === "pro" ? 90 : 90;
  const [range, setRange] = useState<number>(7);
  const all = useMemo(() => demoDays(90), []);
  const rows = windowRows(all, Math.min(range, maxDays));
  const t = totals(rows);

  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summarising, setSummarising] = useState(false);
  const ask = useServerFn(askAnalytics);
  const summarise = useServerFn(analyticsSummary);

  const dataset = {
    note: "Seeded demo data generated inside Crawler.",
    range_days: rows.length,
    daily: rows,
    totals: t,
    top_questions: demoTopics,
    entity_and_product_appearances: demoEntities,
    referrers_and_utm_percent: demoSources,
    known_gaps: demoMissing,
    not_measurable: ["private conversations in ChatGPT, Claude, Gemini, Perplexity or any external assistant"],
  };

  async function run(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    try {
      setAnswer((await ask({ data: { question: q, dataset } })) as Answer);
    } catch {
      toast.error("Could not answer that right now.");
    } finally {
      setBusy(false);
    }
  }

  async function runSummary() {
    setSummarising(true);
    try {
      setSummary((await summarise({ data: { dataset } })) as Summary);
    } catch {
      toast.error("Could not build the summary right now.");
    } finally {
      setSummarising(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Inside Crawler"
          title="Analytics"
          description="Ask in plain language. Crawler answers only from what it can actually measure."
        />

        <div className="mb-6 rounded-xl border border-dashed border-border bg-secondary/60 px-4 py-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Demo data.</strong> These numbers are seeded for testing. Real
          numbers appear once your presence is published and receives traffic.
        </div>

        <div className="rounded-2xl border border-border bg-card p-2">
          <div className="flex flex-wrap items-center gap-2 p-1">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run(question)}
              placeholder="Ask: analytics last 7 days · how many users talked about Product X?"
              className="h-10 flex-1 border-0 shadow-none focus-visible:ring-0"
            />
            <Button onClick={() => void run(question)} disabled={busy || !question.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 px-2 pb-2">
            {INTENTS.map((i) => (
              <button
                key={i}
                onClick={() => {
                  setQuestion(i);
                  void run(i);
                }}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        {answer ? (
          <div className="fade-up mt-4 rounded-2xl border border-border bg-card p-6">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{answer.intent}</div>
            <p className="mt-2 text-[15px] leading-relaxed">{answer.answer}</p>
            {answer.metrics.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                {answer.metrics.map((m) => (
                  <div key={m.label} className="rounded-lg border border-border p-3">
                    <div className="display text-2xl tabular-nums">{m.value}</div>
                    <div className="text-xs text-muted-foreground">{m.label}</div>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="mt-4 text-xs text-muted-foreground">{answer.caveat}</p>
          </div>
        ) : null}

        <div className="mt-10 flex items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              disabled={r > maxDays}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                range === r ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"
              }`}
            >
              {r} days
            </button>
          ))}
          <span className="text-xs text-muted-foreground">
            {maxDays === 7 ? "7-day window on your current plan" : "90-day window"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          {[
            ["Conversations", t.conversations],
            ["Queries", t.queries],
            ["Appearances", t.appearances],
            ["Outbound clicks", t.outboundClicks],
            ["Crawler reads", t.crawlerReads],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl border border-border bg-card p-4">
              <div className="display text-3xl tabular-nums">{(value as number).toLocaleString()}</div>
              <div className="mt-1 text-xs text-muted-foreground">{label as string}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 text-sm font-medium">Conversations & queries</div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="queries" stroke="var(--color-chart-1)" fill="url(#g1)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="conversations" stroke="var(--color-chart-3)" fill="none" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Panel title="What people ask about">
            {demoTopics.map((t2) => (
              <Row key={t2.label} label={t2.label} value={t2.count} trend={t2.trend} />
            ))}
          </Panel>
          <Panel title="Entity & product appearances">
            {demoEntities.map((t2) => (
              <Row key={t2.label} label={t2.label} value={t2.count} trend={t2.trend} />
            ))}
          </Panel>
          <Panel title="Referrers & UTM">
            {demoSources.map((s) => (
              <Row key={s.label} label={s.label} value={s.value} suffix="%" />
            ))}
          </Panel>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">AI summary</div>
              <p className="text-xs text-muted-foreground">
                Recurring questions, missing information and suggested Presence improvements.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void runSummary()} disabled={summarising}>
              {summarising ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Generate
            </Button>
          </div>
          {summary ? (
            <div className="fade-up mt-5 grid gap-6 md:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Recurring questions</div>
                <ul className="mt-2 space-y-1 text-sm">
                  {summary.recurringQuestions.map((q) => (
                    <li key={q}>· {q}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Missing information</div>
                <ul className="mt-2 space-y-1 text-sm">
                  {summary.missingInformation.map((q) => (
                    <li key={q}>· {q}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Improve your presence</div>
                <ul className="mt-2 space-y-2 text-sm">
                  {summary.improvements.map((i) => (
                    <li key={i.action}>
                      <span className="font-medium">{i.action}</span>
                      <span className="text-muted-foreground"> — {i.impact}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">{summary === null ? summaryHint : null}</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}

const summaryHint = "Crawler reads the measurable signal above and proposes concrete Knowledge Core edits.";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 text-sm font-medium">{title}</div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({ label, value, trend, suffix }: { label: string; value: number; trend?: number; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 tabular-nums">
        {value}
        {suffix ?? ""}
        {typeof trend === "number" ? (
          <span className="text-[11px] text-muted-foreground">
            {trend > 0 ? "+" : ""}
            {trend}%
          </span>
        ) : null}
      </span>
    </div>
  );
}
