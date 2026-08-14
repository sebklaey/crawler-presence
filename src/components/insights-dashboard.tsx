/**
 * Insights dashboard UI — measured activity and the free improvement loop.
 *
 * Wording rule: Crawler only reports what it measured. Comparisons over time
 * are phrased as "since the change", never as a cause. Unknown values are
 * shown as "No data", never as zero.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  Info,
  Loader2,
  MousePointerClick,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CONTENT_KIND_LABEL,
  IMPROVEMENT_STATE_LABEL,
  INFO_STATUS_LABEL,
  INSIGHTS_PERIODS,
  PRESENCE_STATE_LABEL,
  SOURCE_LABEL,
  formatDelta,
  periodComparisonLabel,
  type InsightsDashboard,
  type InsightsKpi,
  type InsightsPeriod,
} from "@/lib/insights/model";

function fmtDate(iso: string | null, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function Hint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="Show definition" className="text-muted-foreground/70 hover:text-foreground">
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2 || values.every((v) => v === 0)) return <div className="h-8" />;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="h-8">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="v" stroke="currentColor" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function KpiCard({ kpi, period }: { kpi: InsightsKpi; period: InsightsPeriod }) {
  const delta = formatDelta(kpi.deltaPct);
  const positive = (kpi.deltaPct ?? 0) > 0;
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <span>{kpi.label}</span>
        <Hint text={kpi.tooltip} />
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">
        {kpi.value === null ? <span className="text-base text-muted-foreground">No data</span> : kpi.value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {kpi.key === "potential" ? (
          <span>open improvement suggestions — included in your subscription</span>
        ) : delta ? (
          <span className={positive ? "text-emerald-600 dark:text-emerald-400" : undefined}>
            {delta} {periodComparisonLabel(period)}
          </span>
        ) : (
          <span>No comparison value available</span>
        )}
      </div>
      {kpi.insufficient && kpi.key !== "potential" ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Not enough data yet for a reliable statement.</p>
      ) : (
        <div className="mt-2 text-muted-foreground/60">
          <Spark values={kpi.spark} />
        </div>
      )}
    </div>
  );
}

function StatusPill({ state, url, lastCheckedAt }: { state: InsightsDashboard["state"]; url: string | null; lastCheckedAt: string | null }) {
  const tone =
    state === "online"
      ? "text-emerald-600 dark:text-emerald-400"
      : state === "offline"
        ? "text-destructive"
        : "text-amber-600 dark:text-amber-400";
  return (
    <div className="rounded-xl border bg-card px-4 py-3 text-sm">
      <div className={`flex items-center gap-2 font-medium ${tone}`}>
        <CircleDot className="h-4 w-4" />
        {PRESENCE_STATE_LABEL[state]}
      </div>
      {state === "online" && url ? (
        <a href={url} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs underline underline-offset-4">
          {url.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">Last successful check: {fmtDate(lastCheckedAt, true)}</p>
    </div>
  );
}

export function InsightsDashboardView({
  data,
  period,
  onPeriodChange,
  onImprove,
  improving,
  busy,
}: {
  data: InsightsDashboard;
  period: InsightsPeriod;
  onPeriodChange: (period: InsightsPeriod) => void;
  onImprove: (value: string) => Promise<boolean>;
  improving: boolean;
  busy: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [step, setStep] = useState<"question" | "preview" | "done">("question");
  const [doneAt, setDoneAt] = useState<string | null>(null);

  const updateDates = useMemo(() => new Set(data.updates.map((u) => u.date)), [data.updates]);
  const next = data.nextImprovement;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your AI Presence is being seen</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Here you can see the accesses to your published information measured by Crawler, and how to improve your
              Presence further.
            </p>
          </div>
          <StatusPill state={data.state} url={data.publicUrl} lastCheckedAt={data.lastCheckedAt} />
        </div>

        {data.demo ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
            Example view — this Presence runs in demo mode. These numbers are not real measurements.
          </div>
        ) : null}

        {/* Period filter */}
        <div className="flex flex-wrap items-center gap-2">
          {INSIGHTS_PERIODS.map((p) => (
            <Button
              key={String(p.value)}
              size="sm"
              variant={period === p.value ? "default" : "outline"}
              onClick={() => onPeriodChange(p.value)}
              disabled={busy}
            >
              {p.label}
            </Button>
          ))}
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.kpis.map((kpi) => (
            <KpiCard key={kpi.key} kpi={kpi} period={period} />
          ))}
        </div>

        {data.empty ? (
          <div className="rounded-xl border bg-card px-5 py-10 text-center">
            <h2 className="text-lg font-medium">Your Presence is ready</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              No supported accesses have been measured yet. Crawler keeps checking your Presence and will show activity
              here as soon as it is recorded.
            </p>
          </div>
        ) : (
          <>
            {/* Activity */}
            <section className="rounded-xl border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">Activity over time</h2>
                <Hint text="Daily measured accesses and outbound clicks. Markers show Knowledge Core updates — shown in time order, not as a cause." />
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
                    <RTooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(value: number, key) => [value, key === "access" ? "Measured accesses" : "Outbound clicks"]}
                      labelFormatter={(label: string) => {
                        const update = data.updates.find((u) => u.date === label);
                        return update
                          ? `${label} · ${update.area}: ${update.description}${
                              update.measuredSince === null ? "" : ` — ${update.measuredSince} measured accesses since the change`
                            }`
                          : label;
                      }}
                    />
                    {data.series
                      .filter((p) => updateDates.has(p.date))
                      .map((p) => (
                        <ReferenceLine key={p.date} x={p.date} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                      ))}
                    <Line type="monotone" dataKey="access" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="clicks" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Top content */}
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 text-sm font-medium">Most frequently accessed content</h2>
              {data.topContent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No content fetches were measured for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="pb-2">Content</th>
                        <th className="pb-2">Type</th>
                        <th className="pb-2 text-right">Accesses</th>
                        <th className="pb-2 text-right">Change</th>
                        <th className="pb-2">Last access</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topContent.map((row) => (
                        <tr key={row.path} className="border-t">
                          <td className="py-2 font-medium">{row.label}</td>
                          <td className="py-2 text-muted-foreground">{CONTENT_KIND_LABEL[row.kind]}</td>
                          <td className="py-2 text-right tabular-nums">{row.accesses}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {formatDelta(row.deltaPct) ?? "—"}
                          </td>
                          <td className="py-2 text-muted-foreground">{fmtDate(row.lastAccessAt, true)}</td>
                          <td className="py-2">
                            <Badge variant={row.infoStatus === "current" ? "secondary" : "outline"}>
                              {INFO_STATUS_LABEL[row.infoStatus]}
                            </Badge>
                          </td>
                          <td className="py-2 text-right">
                            <Link to="/knowledge" className="text-xs underline underline-offset-4">
                              Improve content
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Sources & events */}
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border bg-card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-sm font-medium">Where the activity comes from</h2>
                  <Hint text="Only technically detected sources. Undetectable accesses are labelled “Unknown”; no recommendation is inferred from user-agent or log data." />
                </div>
                {data.sources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sources detected in the selected period.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {data.sources.map((s) => (
                      <li key={s.source} className="flex items-center justify-between">
                        <span>{SOURCE_LABEL[s.source]}</span>
                        <span className="tabular-nums text-muted-foreground">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border bg-card p-5">
                <h2 className="mb-3 text-sm font-medium">Events</h2>
                <div className="max-h-72 space-y-2 overflow-y-auto text-xs">
                  {data.events.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No events measured.</p>
                  ) : (
                    data.events.map((e, i) => (
                      <div key={`${e.at}-${i}`} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
                        <div>
                          <div className="font-medium">{e.type}</div>
                          <div className="text-muted-foreground">{e.content ?? "—"}</div>
                          {e.outbound ? (
                            <div className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                              <MousePointerClick className="h-3 w-3" /> {e.outbound}
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right text-muted-foreground">
                          <div>{fmtDate(e.at, true)}</div>
                          <div>{SOURCE_LABEL[e.source]}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {/* Improvement loop */}
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h2 className="text-sm font-medium">Your next improvement</h2>
          </div>
          {next ? (
            <>
              <p className="mt-3 text-sm">{next.issue}</p>
              {next.evidence ? <p className="mt-1 text-xs text-muted-foreground">{next.evidence}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    setAnswer(next.proposedValue ?? next.currentValue ?? "");
                    setStep("question");
                    setDialogOpen(true);
                  }}
                >
                  Improve for free
                </Button>
                <Button variant="outline" onClick={() => setWhyOpen(true)}>
                  Why is this recommended?
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              There is no specific improvement suggestion right now. Crawler keeps reviewing your Presence.
            </p>
          )}
        </section>

        {/* Improvement history */}
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-medium">Your improvements</h2>
          {data.improvements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No published improvements yet.</p>
          ) : (
            <ol className="space-y-4">
              {data.improvements.map((entry) => (
                <li key={entry.id} className="border-l pl-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {entry.area}
                    <Badge variant="outline">{IMPROVEMENT_STATE_LABEL[entry.state]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Published on {fmtDate(entry.date)}</p>
                  {entry.before ? <p className="mt-1 text-xs text-muted-foreground">Before: {entry.before}</p> : null}
                  {entry.after ? <p className="text-xs text-muted-foreground">After: {entry.after}</p> : null}
                  <p className="mt-1 text-xs">
                    {entry.measuredSince === null
                      ? "No measurement data since then."
                      : `Since then: ${entry.measuredSince} measured accesses.`}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Retention */}
        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-medium">Crawler keeps working for your Presence</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            As long as your Presence is online, Crawler keeps your published information available, measures supported
            activity and shows you new improvement options for free.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Days since publication</div>
              <div className="text-lg tabular-nums">{data.retention.daysSincePublish ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Published updates</div>
              <div className="text-lg tabular-nums">{data.retention.publishedUpdates ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total measured accesses</div>
              <div className="text-lg tabular-nums">{data.retention.totalAccesses ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Next freshness check</div>
              <div className="text-lg">{fmtDate(data.retention.nextCheckAt)}</div>
            </div>
          </div>
        </section>

        <p className="text-xs text-muted-foreground">{data.notice}</p>

        {/* Why dialog */}
        <Dialog open={whyOpen} onOpenChange={setWhyOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Why is this recommended?</DialogTitle>
              <DialogDescription>{next?.why}</DialogDescription>
            </DialogHeader>
            {next?.evidence ? <p className="text-sm text-muted-foreground">{next.evidence}</p> : null}
            {next?.affectedFiles.length ? (
              <p className="text-xs text-muted-foreground">Affected files: {next.affectedFiles.join(", ")}</p>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setWhyOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Improvement dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            {step === "done" ? (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Updated
                  </DialogTitle>
                  <DialogDescription>
                    Your Knowledge Core has been updated. Crawler now observes how measured usage develops since this
                    change.
                  </DialogDescription>
                </DialogHeader>
                <p className="text-xs text-muted-foreground">Change date: {fmtDate(doneAt, true)}</p>
                <DialogFooter>
                  <Button onClick={() => setDialogOpen(false)}>Close</Button>
                </DialogFooter>
              </>
            ) : step === "preview" ? (
              <>
                <DialogHeader>
                  <DialogTitle>Preview of the change</DialogTitle>
                  <DialogDescription>
                    The change is only published after your explicit confirmation.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Current</div>
                    <p className="rounded-md border bg-muted/40 p-2 text-xs">{next?.currentValue ?? "— (empty)"}</p>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">New — provider statement</div>
                    <p className="rounded-md border p-2 text-xs">{answer}</p>
                  </div>
                </div>
                <DialogFooter className="sm:justify-between">
                  <Button variant="outline" onClick={() => setStep("question")} disabled={improving}>
                    Back
                  </Button>
                  <Button
                    onClick={async () => {
                      const ok = await onImprove(answer);
                      if (ok) {
                        setDoneAt(new Date().toISOString());
                        setStep("done");
                      }
                    }}
                    disabled={improving}
                  >
                    {improving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>{next?.question}</DialogTitle>
                  <DialogDescription>{next?.why}</DialogDescription>
                </DialogHeader>
                {next?.answerable ? (
                  <Textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={5}
                    placeholder="Your answer — will initially be marked as a provider statement."
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This improvement is edited in your Knowledge Core so that facts, provider statements and missing
                    information stay separate.
                  </p>
                )}
                <DialogFooter className="sm:justify-between">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  {next?.answerable ? (
                    <Button onClick={() => setStep("preview")} disabled={answer.trim().length < 10}>
                      Preview change
                    </Button>
                  ) : (
                    <Button asChild>
                      <Link to="/knowledge">
                        Open Knowledge Core <ArrowUpRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
