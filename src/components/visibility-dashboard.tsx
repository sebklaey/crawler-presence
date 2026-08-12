/**
 * UI des Moduls „AI Visibility Analytics".
 *
 * Jede Kennzahl weist Quelle, Zeitraum, Definition und Messstatus aus.
 * Es werden ausschließlich gemessene Werte dargestellt; nicht verbundene
 * Adapter zeigen „Nicht verbunden" und niemals Beispielzahlen.
 */
import { useMemo } from "react";
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
  delayed: "Verzögert",
  demo: "Demo",
  not_connected: "Nicht verbunden",
};

export function ScopeNotice({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-border/70 bg-secondary/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
      <strong className="text-foreground">Messumfang.</strong> {text}
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
    return <span className="text-xs text-muted-foreground">keine Vergleichsdaten</span>;
  }
  const sign = kpi.delta > 0 ? "+" : "";
  return (
    <span className="text-xs text-muted-foreground">
      {sign}
      {kpi.delta}% ggü. vorheriger Periode ({kpi.previous})
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
            <TooltipTrigger aria-label={`Definition von ${kpi.label}`} className="text-muted-foreground">
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
          <span className="text-xs text-muted-foreground">Quelle nicht verbunden — keine Daten</span>
        ) : (
          <DeltaLabel kpi={kpi} />
        )}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Quelle: {kpi.sourceLabel} · Zeitraum: {windowLabel}
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
      <div className="flex flex-wrap gap-1" role="group" aria-label="Zeitraum">
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
              title={locked ? "Im aktuellen Plan nicht enthalten" : undefined}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <label className="sr-only" htmlFor="filter-source">
        Quelle
      </label>
      <select
        id="filter-source"
        className={selectClass}
        value={source}
        onChange={(e) => onChange({ source: e.target.value as SourceType | "all" })}
      >
        <option value="all">Alle Quellen</option>
        {(Object.keys(SOURCE_LABELS) as SourceType[]).map((key) => (
          <option key={key} value={key}>
            {SOURCE_LABELS[key].label}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="filter-event">
        Ereignistyp
      </label>
      <select
        id="filter-event"
        className={selectClass}
        value={eventType}
        onChange={(e) => onChange({ eventType: e.target.value as EventType | "all" })}
      >
        <option value="all">Alle Ereignistypen</option>
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
    return <EmptyState>Noch keine Ereignisse im gewählten Zeitraum gemessen.</EmptyState>;
  }
  return (
    <div className="h-64 w-full" role="img" aria-label="Beobachtete Erwähnungen und Dateizugriffe pro Tag">
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
          <Bar dataKey="mentions" name="Beobachtete Erwähnungen" fill="hsl(var(--foreground))" radius={[2, 2, 0, 0]} />
          <Bar dataKey="reads" name="Dateizugriffe" fill="hsl(var(--muted-foreground))" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
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
  benchmarkBusy,
}: {
  data: VisibilityDashboard;
  filters: { period: Period; source: SourceType | "all"; eventType: EventType | "all" };
  maxDays: number;
  onFilterChange: (next: { period?: Period; source?: SourceType | "all"; eventType?: EventType | "all" }) => void;
  onBenchmark?: () => void;
  onExport?: () => void;
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
              <h2 className="display mb-3 text-xl">Erwähnungen und Dateizugriffe pro Tag</h2>
              <TimeChart data={data.series} />
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div>
                <h2 className="display mb-3 text-xl">Quellenverteilung</h2>
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
                  <EmptyState>Keine Ereignisse im Zeitraum.</EmptyState>
                )}
              </div>
              <div>
                <h2 className="display mb-3 text-xl">Wichtigste Veränderungen</h2>
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
                    <li className="text-muted-foreground">Keine messbaren Veränderungen gegenüber der Vorperiode.</li>
                  ) : null}
                </ul>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="mentions" className="space-y-4 pt-6">
            <p className="text-xs text-muted-foreground">
              Beobachtete Erwähnungen mit Zeitpunkt, Quelle und – sofern öffentlich – URL. Private Gesprächsinhalte
              werden nicht gespeichert und nicht angezeigt.
            </p>
            {data.mentions.length ? (
              <div className="overflow-x-auto rounded-xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zeitpunkt</TableHead>
                      <TableHead>Quelle</TableHead>
                      <TableHead>Entität</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Öffentliche URL</TableHead>
                      <TableHead>Konfidenz</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.mentions.map((m, i) => (
                      <TableRow key={`${m.occurredAt}-${i}`}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(m.occurredAt).toLocaleString("de-DE")}
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
              <EmptyState>Im gewählten Zeitraum wurden keine Erwähnungen beobachtet.</EmptyState>
            )}
          </TabsContent>

          <TabsContent value="reads" className="space-y-4 pt-6">
            <p className="text-xs text-muted-foreground">
              Ein Dateiaufruf bedeutet <strong className="text-foreground">keine</strong> nachgewiesene Zitierung oder
              Empfehlung. Gezählt werden ausschließlich Abrufe der veröffentlichten Dateien.
            </p>
            {data.reads.length ? (
              <div className="overflow-x-auto rounded-xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datei</TableHead>
                      <TableHead>Reads</TableHead>
                      <TableHead>Eindeutige Sessions</TableHead>
                      <TableHead>Referrer-Kategorie</TableHead>
                      <TableHead>Client-Kategorie</TableHead>
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
              <EmptyState>Noch keine Dateizugriffe im Zeitraum gemessen.</EmptyState>
            )}
          </TabsContent>

          <TabsContent value="benchmark" className="space-y-4 pt-6">
            <div className="rounded-xl border border-dashed border-border bg-secondary/50 px-4 py-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Kontrollierter Benchmark – keine reale Nutzermessung.</strong> Ein
              festes Set neutraler Testfragen wird an ausgewählte AI-Modelle geschickt und ausgewertet. Gespeichert
              werden nur Bewertungen, keine vollständigen Prompts oder Antworten.
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {onBenchmark ? (
                <button
                  type="button"
                  onClick={onBenchmark}
                  disabled={benchmarkBusy}
                  className="rounded-full border border-border px-4 py-1.5 text-xs hover:border-foreground/40 disabled:opacity-50"
                >
                  {benchmarkBusy ? "Benchmark läuft…" : "Benchmark jetzt ausführen"}
                </button>
              ) : null}
              <span className="text-xs text-muted-foreground">
                Läufe: {data.benchmarkSummary.runs} · Erwähnt:{" "}
                {data.benchmarkSummary.mentionRate === null ? "—" : `${data.benchmarkSummary.mentionRate}%`} · Sachlich
                korrekt: {data.benchmarkSummary.correctRate === null ? "—" : `${data.benchmarkSummary.correctRate}%`} ·
                Quelle genannt: {data.benchmarkSummary.citedRate === null ? "—" : `${data.benchmarkSummary.citedRate}%`}
              </span>
            </div>
            {data.benchmarks.length ? (
              <div className="overflow-x-auto rounded-xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zeitpunkt</TableHead>
                      <TableHead>Modell</TableHead>
                      <TableHead>Testfrage</TableHead>
                      <TableHead>Erwähnt</TableHead>
                      <TableHead>Korrekt</TableHead>
                      <TableHead>Quelle</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Fehlinterpretationen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.benchmarks.map((b, i) => (
                      <TableRow key={`${b.testedAt}-${i}`}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(b.testedAt).toLocaleString("de-DE")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {b.provider} · {b.model}
                        </TableCell>
                        <TableCell className="text-xs">
                          {b.prompt} <span className="text-muted-foreground">({b.promptVersion})</span>
                        </TableCell>
                        <TableCell className="text-xs">{b.mentioned ? "ja" : "nein"}</TableCell>
                        <TableCell className="text-xs">
                          {b.descriptionCorrect === null ? "—" : b.descriptionCorrect ? "ja" : "nein"}
                        </TableCell>
                        <TableCell className="text-xs">{b.sourceCited ? "ja" : "nein"}</TableCell>
                        <TableCell className="text-xs">{b.position ?? "—"}</TableCell>
                        <TableCell className="max-w-[240px] text-xs">{b.issues.join(", ") || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState>Noch keine Benchmark-Läufe für diese Presence.</EmptyState>
            )}
          </TabsContent>

          <TabsContent value="sources" className="space-y-4 pt-6">
            <p className="text-xs text-muted-foreground">
              Crawler misst derzeit eigene Tool-Interaktionen, Presence-Dateizugriffe und verbundene öffentliche
              Quellen. Private Unterhaltungen in externen AI-Assistenten sind nicht enthalten.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {data.adapters.map((a) => (
                <div key={a.type} className="rounded-xl border border-border/70 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm">{a.label}</h3>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{a.definition}</p>
                  <dl className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                    <div>
                      <dt className="inline text-foreground">Gemessen: </dt>
                      <dd className="inline">{a.measured}</dd>
                    </div>
                    <div>
                      <dt className="inline text-foreground">Nicht gemessen: </dt>
                      <dd className="inline">{a.notMeasured}</dd>
                    </div>
                    <div>
                      <dt className="inline text-foreground">Letzter Sync: </dt>
                      <dd className="inline">
                        {a.lastSyncedAt ? new Date(a.lastSyncedAt).toLocaleString("de-DE") : "—"}
                      </dd>
                    </div>
                  </dl>
                  {a.status === "not_connected" && a.connectHint ? (
                    <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                      {a.connectHint}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            {onExport ? (
              <button
                type="button"
                onClick={onExport}
                className="rounded-full border border-border px-4 py-1.5 text-xs hover:border-foreground/40"
              >
                Analytics exportieren (JSON)
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
              Hinweise entstehen ausschließlich aus gemessenen Ereignissen. Keine Aussagen über Reichweite, Ranking
              oder tatsächliche Personen.
            </p>
          </TabsContent>
        </Tabs>

        <p className="text-[11px] text-muted-foreground">
          Datenerfassung seit: {data.dataSince ? new Date(data.dataSince).toLocaleString("de-DE") : "noch keine Ereignisse"}
        </p>
      </div>
    </TooltipProvider>
  );
}
