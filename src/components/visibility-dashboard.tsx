/**
 * UI for the "AI Visibility Analytics" module.
 *
 * Every metric states its source, period, definition and measurement status.
 * Only measured values are displayed; sources that are not connected show
 * "Not connected" and never example numbers.
 */
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

import {
  EVENT_LABELS,
  PERIODS,
  SOURCE_LABELS,
  type EventType,
  type Kpi,
  type MetricStatus,
  type Period,
  type SourceType,
  type VisibilityDashboard,
} from "@/lib/visibility/model";

const STATUS_LABEL: Record<MetricStatus, string> = {
  live: "Live",
  delayed: "Delayed",
  demo: "Demo",
  not_connected: "Not connected",
};

export function ScopeNotice({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-border/70 bg-secondary/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
      <strong className="text-foreground">Measurement scope.</strong> {text}
    </p>
  );
}

function StatusBadge({ status }: { status: MetricStatus }) {
  return (
    <Badge
      variant={status === "live" ? "secondary" : "outline"}
      className={status === "not_connected" ? "border-dashed text-muted-foreground" : ""}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function DeltaLabel({ kpi }: { kpi: Kpi }) {
  if (kpi.delta === null) {
    return <span className="text-xs text-muted-foreground">no comparison data</span>;
  }
  const sign = kpi.delta > 0 ? "+" : "";
  return (
    <span className="text-xs text-muted-foreground">
      {sign}
      {kpi.delta}% vs. previous period ({kpi.previous})
    </span>
  );
}

function KpiCard({ kpi, windowLabel }: { kpi: Kpi; windowLabel: string }) {
  return (
    <div className="rounded-xl border border-border/70 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground">{kpi.label}</h3>
          <Tooltip>
            <TooltipTrigger aria-label={`Definition of ${kpi.label}`} className="text-muted-foreground">
              <Info className="h-3.5 w-3.5" aria-hidden />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{kpi.definition}</TooltipContent>
          </Tooltip>
        </div>
        <StatusBadge status={kpi.status} />
      </div>
      <p className="display mt-3 text-3xl tabular-nums">
        {kpi.status === "not_connected" ? "—" : kpi.value}
        {kpi.unit === "score" && kpi.status !== "not_connected" ? <span className="text-base">/100</span> : null}
      </p>
      <div className="mt-1">
        {kpi.status === "not_connected" ? (
          <span className="text-xs text-muted-foreground">Source not connected — no data</span>
        ) : (
          <DeltaLabel kpi={kpi} />
        )}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Source: {kpi.sourceLabel} · Period: {windowLabel}
      </p>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function VisibilityFilters({
  period,
  source,
  eventType,
  maxDays,
  onChange,
}: {
  period: Period;
  source: SourceType | "all";
  eventType: EventType | "all";
  maxDays: number;
  onChange: (next: { period?: Period; source?: SourceType | "all"; eventType?: EventType | "all" }) => void;
}) {
  const selectClass =
    "h-9 rounded-md border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Period">
        {PERIODS.map((p) => {
          const locked = p.value !== "all" ? p.value > maxDays : maxDays < 3650;
          return (
            <button
              key={String(p.value)}
              type="button"
              disabled={locked}
              onClick={() => onChange({ period: p.value })}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                period === p.value ? "border-foreground text-foreground" : "border-border text-muted-foreground"
              } ${locked ? "cursor-not-allowed opacity-40" : "hover:border-foreground/40"}`}
              title={locked ? "Not included in your current plan" : undefined}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <label className="sr-only" htmlFor="filter-source">
        Source
      </label>
      <select
        id="filter-source"
        className={selectClass}
        value={source}
        onChange={(e) => onChange({ source: e.target.value as SourceType | "all" })}
      >
        <option value="all">All sources</option>
        {(Object.keys(SOURCE_LABELS) as SourceType[]).map((key) => (
          <option key={key} value={key}>
            {SOURCE_LABELS[key].label}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="filter-event">
        Event type
      </label>
      <select
        id="filter-event"
        className={selectClass}
        value={eventType}
        onChange={(e) => onChange({ eventType: e.target.value as EventType | "all" })}
      >
        <option value="all">All event types</option>
        {(Object.keys(EVENT_LABELS) as EventType[]).map((key) => (
          <option key={key} value={key}>
            {EVENT_LABELS[key]}
          </option>
        ))}
      </select>
    </div>
  );
}

function TimeChart({ data }: { data: VisibilityDashboard["series"] }) {
  const hasData = useMemo(() => data.some((d) => d.mentions > 0 || d.reads > 0), [data]);
  if (!hasData) {
    return <EmptyState>No events measured in the selected period yet.</EmptyState>;
  }
  return (
    <div className="h-64 w-full" role="img" aria-label="Observed mentions and file reads per day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickMargin={6} minTickGap={24} />
          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
          <RechartsTooltip
            contentStyle={{
              background: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="mentions" name="Observed mentions" fill="hsl(var(--foreground))" radius={[2, 2, 0, 0]} />
          <Bar dataKey="reads" name="File reads" fill="hsl(var(--muted-foreground))" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AdapterCard({
  adapter: a,
  onConnect,
}: {
  adapter: VisibilityDashboard["adapters"][number];
  onConnect?: ((input: { source: SourceType; connected: boolean; value?: string }) => Promise<void> | void) | undefined;
}) {
  const [value, setValue] = useState(a.configValue ?? "");
  const [busy, setBusy] = useState(false);
  const connected = a.status !== "not_connected";

  async function submit(next: boolean) {
    if (!onConnect) return;
    setBusy(true);
    try {
      const trimmed = value.trim();
      await onConnect({ source: a.type, connected: next, ...(trimmed ? { value: trimmed } : {}) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm">{a.label}</h3>
        <StatusBadge status={a.status} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{a.definition}</p>
      <dl className="mt-3 space-y-1 text-[11px] text-muted-foreground">
        <div>
          <dt className="inline text-foreground">Measured: </dt>
          <dd className="inline">{a.measured}</dd>
        </div>
        <div>
          <dt className="inline text-foreground">Not measured: </dt>
          <dd className="inline">{a.notMeasured}</dd>
        </div>
        <div>
          <dt className="inline text-foreground">Last sync: </dt>
          <dd className="inline">{a.lastSyncedAt ? new Date(a.lastSyncedAt).toLocaleString("en-US") : "—"}</dd>
        </div>
      </dl>

      {a.connectable && onConnect ? (
        <div className="mt-3 space-y-2 rounded-lg border border-dashed border-border px-3 py-3">
          {a.connectHint ? <p className="text-[11px] text-muted-foreground">{a.connectHint}</p> : null}
          {a.configLabel ? (
            <label className="block text-[11px] text-muted-foreground">
              {a.configLabel}
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={a.configLabel}
              />
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit(true)}
              className="rounded-full border border-foreground px-4 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
            >
              {busy ? "Saving…" : connected ? "Update connection" : "Connect source"}
            </button>
            {connected ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit(false)}
                className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground hover:border-foreground/40 disabled:opacity-50"
              >
                Disconnect
              </button>
            ) : null}
          </div>
        </div>
      ) : !a.connectable ? (
        <p className="mt-3 text-[11px] text-muted-foreground">Built into Crawler — always on, nothing to connect.</p>
      ) : a.connectHint ? (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
          {a.connectHint}
        </p>
      ) : null}
    </div>
  );
}

export function VisibilityDashboardView({
  data,
  filters,
  maxDays,
  onFilterChange,
  onBenchmark,
  onExport,
  onConnect,
  benchmarkBusy,
}: {
  data: VisibilityDashboard;
  filters: { period: Period; source: SourceType | "all"; eventType: EventType | "all" };
  maxDays: number;
  onFilterChange: (next: { period?: Period; source?: SourceType | "all"; eventType?: EventType | "all" }) => void;
  onBenchmark?: () => void;
  onExport?: () => void;
  onConnect?: (input: { source: SourceType; connected: boolean; value?: string }) => Promise<void> | void;
  benchmarkBusy?: boolean;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-6">
        <ScopeNotice text={data.scopeNotice} />

        <VisibilityFilters
          period={filters.period}
          source={filters.source}
          eventType={filters.eventType}
          maxDays={maxDays}
          onChange={onFilterChange}
        />

        <Tabs defaultValue="overview">
          <TabsList className="flex w-full flex-wrap justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="mentions">Mentions</TabsTrigger>
            <TabsTrigger value="reads">Presence Reads</TabsTrigger>
            <TabsTrigger value="benchmark">Benchmark</TabsTrigger>
            <TabsTrigger value="sources">Sources &amp; Coverage</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 pt-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.kpis.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} windowLabel={data.windowLabel} />
              ))}
            </div>

            <section>
              <h2 className="display mb-3 text-xl">Mentions and file reads per day</h2>
              <TimeChart data={data.series} />
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div>
                <h2 className="display mb-3 text-xl">Source breakdown</h2>
                {data.sourceBreakdown.length ? (
                  <ul className="divide-y divide-border/70 rounded-xl border border-border/70 text-sm">
                    {data.sourceBreakdown.map((s) => (
                      <li key={s.source} className="flex items-center justify-between px-4 py-2">
                        <span>{s.label}</span>
                        <span className="tabular-nums text-muted-foreground">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>No events in this period.</EmptyState>
                )}
              </div>
              <div>
                <h2 className="display mb-3 text-xl">Biggest changes</h2>
                <ul className="space-y-2 rounded-xl border border-border/70 p-4 text-sm">
                  {data.kpis
                    .filter((k) => k.delta !== null && k.delta !== 0)
                    .slice(0, 4)
                    .map((k) => (
                      <li key={k.key} className="text-muted-foreground">
                        <span className="text-foreground">{k.label}:</span> {k.delta! > 0 ? "+" : ""}
                        {k.delta}% ({k.previous} → {k.value})
                      </li>
                    ))}
                  {data.kpis.every((k) => k.delta === null || k.delta === 0) ? (
                    <li className="text-muted-foreground">No measurable changes compared to the previous period.</li>
                  ) : null}
                </ul>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="mentions" className="space-y-4 pt-6">
            <p className="text-xs text-muted-foreground">
              Observed mentions with timestamp, source and — where public — URL. Private conversation content is
              never stored and never shown.
            </p>
            {data.mentions.length ? (
              <div className="overflow-x-auto rounded-xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Public URL</TableHead>
                      <TableHead>Confidence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.mentions.map((m, i) => (
                      <TableRow key={`${m.occurredAt}-${i}`}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(m.occurredAt).toLocaleString("en-US")}
                        </TableCell>
                        <TableCell className="text-xs">{SOURCE_LABELS[m.source]?.label ?? m.source}</TableCell>
                        <TableCell className="text-xs">{m.entity ?? "—"}</TableCell>
                        <TableCell className="text-xs">{EVENT_LABELS[m.mentionType] ?? m.mentionType}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs">
                          {m.publicUrl ? (
                            <a href={m.publicUrl} rel="noopener noreferrer nofollow" target="_blank" className="underline underline-offset-4">
                              {m.publicUrl}
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{m.confidence === null ? "—" : m.confidence.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState>No mentions were observed in the selected period.</EmptyState>
            )}
          </TabsContent>

          <TabsContent value="reads" className="space-y-4 pt-6">
            <p className="text-xs text-muted-foreground">
              A file read is <strong className="text-foreground">not</strong> a proven citation or recommendation.
              Only requests for the published files are counted.
            </p>
            {data.reads.length ? (
              <div className="overflow-x-auto rounded-xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Reads</TableHead>
                      <TableHead>Unique sessions</TableHead>
                      <TableHead>Referrer category</TableHead>
                      <TableHead>Client category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.reads.map((r) => (
                      <TableRow key={r.path}>
                        <TableCell className="text-xs"><code>{r.path}</code></TableCell>
                        <TableCell className="text-xs tabular-nums">{r.reads}</TableCell>
                        <TableCell className="text-xs tabular-nums">{r.uniqueSessions}</TableCell>
                        <TableCell className="text-xs">{r.referrer}</TableCell>
                        <TableCell className="text-xs">{r.client}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState>No file reads measured in this period yet.</EmptyState>
            )}
          </TabsContent>

          <TabsContent value="benchmark" className="space-y-4 pt-6">
            <div className="rounded-xl border border-dashed border-border bg-secondary/50 px-4 py-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Controlled benchmark — not a measurement of real users.</strong> A
              fixed set of neutral test questions is answered and rated by the connected assistant (ChatGPT via MCP) —
              Crawler runs no AI model of its own. Only the ratings are stored, never full prompts or answers.
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {onBenchmark ? (
                <button
                  type="button"
                  onClick={onBenchmark}
                  disabled={benchmarkBusy}
                  className="rounded-full border border-border px-4 py-1.5 text-xs hover:border-foreground/40 disabled:opacity-50"
                >
                  {benchmarkBusy ? "Benchmark running…" : "Run benchmark now"}
                </button>
              ) : null}
              <span className="text-xs text-muted-foreground">
                Runs: {data.benchmarkSummary.runs} · Mentioned:{" "}
                {data.benchmarkSummary.mentionRate === null ? "—" : `${data.benchmarkSummary.mentionRate}%`} ·
                Factually correct:{" "}
                {data.benchmarkSummary.correctRate === null ? "—" : `${data.benchmarkSummary.correctRate}%`} · Source
                cited: {data.benchmarkSummary.citedRate === null ? "—" : `${data.benchmarkSummary.citedRate}%`}
              </span>
            </div>
            {data.benchmarks.length ? (
              <div className="overflow-x-auto rounded-xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Test question</TableHead>
                      <TableHead>Mentioned</TableHead>
                      <TableHead>Correct</TableHead>
                      <TableHead>Source cited</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Misinterpretations</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.benchmarks.map((b, i) => (
                      <TableRow key={`${b.testedAt}-${i}`}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(b.testedAt).toLocaleString("en-US")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {b.provider} · {b.model}
                        </TableCell>
                        <TableCell className="text-xs">
                          {b.prompt} <span className="text-muted-foreground">({b.promptVersion})</span>
                        </TableCell>
                        <TableCell className="text-xs">{b.mentioned ? "yes" : "no"}</TableCell>
                        <TableCell className="text-xs">
                          {b.descriptionCorrect === null ? "—" : b.descriptionCorrect ? "yes" : "no"}
                        </TableCell>
                        <TableCell className="text-xs">{b.sourceCited ? "yes" : "no"}</TableCell>
                        <TableCell className="text-xs">{b.position ?? "—"}</TableCell>
                        <TableCell className="max-w-[240px] text-xs">{b.issues.join(", ") || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState>No benchmark runs for this Presence yet.</EmptyState>
            )}
          </TabsContent>

          <TabsContent value="sources" className="space-y-4 pt-6">
            <p className="text-xs text-muted-foreground">
              Crawler currently measures its own tool interactions, Presence file reads and connected public sources.
              Private conversations in external AI assistants are never included.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {data.adapters.map((a) => (
                <AdapterCard key={a.type} adapter={a} onConnect={onConnect} />
              ))}
            </div>
            {onExport ? (
              <button
                type="button"
                onClick={onExport}
                className="rounded-full border border-border px-4 py-1.5 text-xs hover:border-foreground/40"
              >
                Export analytics (JSON)
              </button>
            ) : null}
          </TabsContent>

          <TabsContent value="insights" className="space-y-3 pt-6">
            <ul className="space-y-2 rounded-xl border border-border/70 p-4 text-sm text-muted-foreground">
              {data.insights.map((insight) => (
                <li key={insight}>· {insight}</li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">
              Insights are derived only from measured events. No claims about reach, ranking or actual people.
            </p>
          </TabsContent>
        </Tabs>

        <p className="text-[11px] text-muted-foreground">
          Collecting data since: {data.dataSince ? new Date(data.dataSince).toLocaleString("en-US") : "no events yet"}
        </p>
      </div>
    </TooltipProvider>
  );
}
