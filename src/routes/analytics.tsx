import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { KeyRound, Loader2, Sparkles } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { AppShell, PageHead } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyticsSummary, askAnalytics } from "@/lib/analytics.functions";
import { presenceAnalyticsFn, type PresenceAnalyticsResult } from "@/lib/manage.functions";
import { useRecoveryCode } from "@/lib/store";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Crawler" },
      {
        name: "description",
        content:
          "Measured Presence analytics inside Crawler: conversations, mentions, public reads and outbound clicks. Open with your recovery code.",
      },
      { property: "og:title", content: "Analytics — Crawler" },
      {
        property: "og:description",
        content: "Only measurable signal. Never private ChatGPT, Claude or Gemini conversations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

const RANGES = [7, 30, 90] as const;
const INTENTS = [
  "Analytics last 7 days",
  "How often was this Presence mentioned?",
  "Which files do AI crawlers read most?",
  "Are my outbound links being clicked?",
];

const REASONS: Record<string, string> = {
  "invalid-code": "That does not look like a Crawler recovery code. It has the form slug~crw_…",
  "not-found": "No Presence matches this recovery code.",
  "rate-limited": "Too many attempts. Wait a minute and try again.",
  unavailable: "Analytics are temporarily unavailable. Please try again in a moment.",
};

type Answer = { intent: string; answer: string; metrics: { label: string; value: string }[]; caveat: string };
type Summary = {
  headline: string;
  recurringQuestions: string[];
  missingInformation: string[];
  improvements: { action: string; impact: string }[];
};
type Data = Extract<PresenceAnalyticsResult, { ok: true }>;

function AnalyticsPage() {
  const [code, setCode] = useState("");
  const [range, setRange] = useState<number>(7);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);

  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summarising, setSummarising] = useState(false);

  const load = useServerFn(presenceAnalyticsFn);
  const ask = useServerFn(askAnalytics);
  const summarise = useServerFn(analyticsSummary);
  const [storedCode, setStoredCode, codeHydrated] = useRecoveryCode();
  const autoOpened = useRef(false);

  // The recovery code entered on /manage opens analytics for the same Presence.
  useEffect(() => {
    if (!codeHydrated || autoOpened.current || !storedCode) return;
    autoOpened.current = true;
    setCode(storedCode);
    void open(range, storedCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeHydrated, storedCode]);

  async function open(days = range, next = code) {
    if (!next.trim()) return;
    setLoading(true);
    try {
      const result = await load({ data: { code: next, days: days as 7 | 30 | 90 } });
      if (!result.ok) {
        setData(null);
        toast.error(REASONS[result.reason] ?? "Could not open those analytics.");
        return;
      }
      setData(result);
      setRange(result.windowDays);
      setStoredCode(next);
    } catch {
      toast.error("Could not open those analytics.");
    } finally {
      setLoading(false);
    }
  }

  const dataset = data
    ? {
        note: "Measured inside Crawler only. No seeded or demo numbers.",
        presence: data.name,
        range_days: data.windowDays,
        daily: data.daily,
        totals: data.totals,
        file_reads: data.fileReads,
        sources: data.sources,
        data_since: data.dataSince,
        not_measurable: [
          "private conversations in ChatGPT, Claude, Gemini, Perplexity or any external assistant",
        ],
      }
    : null;

  async function run(q: string) {
    if (!q.trim() || busy || !dataset) return;
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
    if (!dataset) return;
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
          description="Real, measured numbers for your published Presence. Open them with your recovery code — no account, no login."
        />

        <div className="rounded-2xl border border-border bg-card p-5">
          <label className="text-xs text-muted-foreground" htmlFor="analytics-code">
            Recovery code
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              id="analytics-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void open()}
              placeholder="your-presence~crw_…"
              className="h-10 max-w-md flex-1 font-mono text-sm"
              autoComplete="off"
            />
            <Button onClick={() => void open()} disabled={loading || !code.trim()}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Open analytics
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Analytics are capability-based: whoever holds the recovery code sees them. Public aggregate counts are also
            available without a code through the Crawler <code>get_analytics</code> tool.
          </p>
        </div>

        {data ? (
          <>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => void open(r)}
                  disabled={r > data.maxWindowDays || loading}
                  className={`rounded-md px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                    range === r ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"
                  }`}
                >
                  {r} days
                </button>
              ))}
              <span className="text-xs text-muted-foreground">
                {data.maxWindowDays === 7 ? "7-day window on the Plus plan" : "90-day window"} ·{" "}
                {data.dataSince
                  ? `measuring since ${new Date(data.dataSince).toLocaleDateString()}`
                  : "no events measured yet"}
              </span>
            </div>

            {!data.measured ? (
              <div className="mt-4 rounded-xl border border-dashed border-border bg-secondary/60 px-4 py-3 text-xs text-muted-foreground">
                <strong className="text-foreground">No events measured yet.</strong> Numbers appear as soon as Crawler
                tool calls reference this Presence or its public files are read. Crawler shows no demo data.
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {[
                ["Crawler conversations", data.totals.conversations],
                ["Mention events", data.totals.mentions],
                ["Public reads", data.totals.reads],
                ["Outbound clicks", data.totals.outboundClicks],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl border border-border bg-card p-4">
                  <div className="display text-3xl tabular-nums">{(value as number).toLocaleString()}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{label as string}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 text-sm font-medium">Mentions &amp; reads per day</div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.daily} margin={{ left: -20, right: 8, top: 8 }}>
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
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="reads"
                      stroke="var(--color-chart-1)"
                      fill="url(#g1)"
                      strokeWidth={1.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="mentions"
                      stroke="var(--color-chart-3)"
                      fill="none"
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Panel title="Most read files">
                {data.fileReads.length ? (
                  data.fileReads.slice(0, 8).map((f) => <Row key={f.path} label={f.path} value={f.count} />)
                ) : (
                  <Empty />
                )}
              </Panel>
              <Panel title="Where events came from">
                {data.sources.length ? (
                  data.sources.map((s) => <Row key={s.source} label={s.source} value={s.count} />)
                ) : (
                  <Empty />
                )}
              </Panel>
            </div>

            <div className="mt-8 rounded-2xl border border-border bg-card p-2">
              <div className="flex flex-wrap items-center gap-2 p-1">
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void run(question)}
                  placeholder="Ask: analytics last 7 days · which files are read most?"
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

            <div className="mt-4 rounded-2xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">AI summary</div>
                  <p className="text-xs text-muted-foreground">
                    Recurring questions, missing information and suggested Presence improvements — derived from your
                    measured events only.
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
                <p className="mt-5 text-sm text-muted-foreground">
                  Crawler reads the measurable signal above and proposes concrete Knowledge Core edits.
                </p>
              )}
            </div>

            <p className="mt-6 text-xs text-muted-foreground">{data.privacyNote}</p>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 text-sm font-medium">{title}</div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Empty() {
  return <p className="py-2 text-sm text-muted-foreground">Nothing measured in this window yet.</p>;
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}
