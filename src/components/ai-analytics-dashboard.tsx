/**
 * AI analytics dashboard view.
 *
 * Every number is labelled with its evidence type and its window. Missing
 * sources render as "Not connected" instead of a fabricated zero, and
 * synthetic test rates always carry their sample size.
 */
import { useMemo, useState } from "react";
import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Download, Info, Loader2, Plug, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ANALYTICS_PERIODS,
  CONNECTOR_STATUS_LABEL,
  EVIDENCE_DEFINITION,
  EVIDENCE_LABEL,
  PROVIDER_LABEL,
  WHAT_IS_NOT_MEASURABLE,
  WHAT_THIS_SHOWS,
  formatCount,
  formatLocal,
  formatRate,
  type AiAnalyticsDashboard,
  type AnalyticsPeriod,
  type EvidenceType,
  type ProviderId,
  type SourceType,
} from "@/lib/analytics/model";

type Props = {
  data: AiAnalyticsDashboard;
  period: AnalyticsPeriod;
  busy: boolean;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  onSync: (source: "search_console" | "ai_probes") => Promise<void>;
  onSaveSource: (source: "search_console", value: string) => Promise<void>;
  onConnect: (
    source: "search_console" | "ai_probes",
    choice?: string,
  ) => Promise<{ ok: boolean; choices?: { value: string; label: string }[] }>;
  onExport: () => Promise<void>;
  pending: string | null;
};

function EvidenceBadge({ evidence }: { evidence: EvidenceType }) {
  return (
    <TooltipProvider>
      <UiTooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="cursor-help text-[10px] uppercase tracking-wide">
            {EVIDENCE_LABEL[evidence]}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{EVIDENCE_DEFINITION[evidence]}</TooltipContent>
      </UiTooltip>
    </TooltipProvider>
  );
}

export function AiAnalyticsDashboardView(props: Props) {
  const { data } = props;
  const [provider, setProvider] = useState<ProviderId | "all">("all");
  const [evidence, setEvidence] = useState<EvidenceType | "all">("all");
  const [source, setSource] = useState<SourceType | "all">("all");
  const [choices, setChoices] = useState<Record<string, { value: string; label: string }[] | null>>({});


  const citations = useMemo(
    () =>
      data.citations.filter(
        (row) =>
          (provider === "all" || row.provider === provider) &&
          (evidence === "all" || row.evidence === evidence) &&
          (source === "all" || row.source === source),
      ),
    [data.citations, provider, evidence, source],
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI visibility of {data.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.windowLabel} · generated {formatLocal(data.generatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(props.period)} onValueChange={(v) => props.onPeriodChange((v === "all" ? "all" : Number(v)) as AnalyticsPeriod)}>
            <SelectTrigger className="w-36" aria-label="Time period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANALYTICS_PERIODS.map((p) => (
                <SelectItem key={String(p.value)} value={String(p.value)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void props.onExport()} disabled={props.busy}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
        </div>
      </header>

      <Card className="border-dashed p-4 text-xs leading-relaxed text-muted-foreground">
        <div className="flex gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{data.notice}</p>
        </div>
      </Card>

      {data.partial ? (
        <Card className="flex items-start gap-2 border-destructive/40 p-4 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>At least one connected source failed on its last sync. Its numbers are incomplete, not zero.</p>
        </Card>
      ) : null}

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.cards.map((card) => (
          <Card key={card.key} className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              <EvidenceBadge evidence={card.evidence} />
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              {card.value === null
                ? formatCount(null, card.status)
                : card.unit === "percent"
                  ? `${card.value} %`
                  : card.value.toLocaleString()}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {card.periodLabel}
              {card.deltaPct !== null ? ` · ${card.deltaPct > 0 ? "+" : ""}${card.deltaPct} % vs. previous period` : ""}
            </p>
            {card.sample ? (
              <p className="text-[11px] text-muted-foreground">
                n = {card.sample.n} · 95 % CI {card.sample.ciLow}–{card.sample.ciHigh} %
                {card.sample.preliminary ? " · preliminary" : ""}
              </p>
            ) : null}
            {card.statusHint ? <p className="text-[11px] text-muted-foreground">{card.statusHint}</p> : null}
            <p className="text-[11px] text-muted-foreground">{card.tooltip}</p>
          </Card>
        ))}
      </section>

      {/* Time series */}
      <Card className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">Development over time</h2>
          <p className="text-[11px] text-muted-foreground">Synthetic test results stay on their own line.</p>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="presence_reads" name="Presence reads" stroke="currentColor" dot={false} />
              <Line type="monotone" dataKey="verified_ai_fetches" name="Verified AI fetches" stroke="#2563eb" dot={false} />
              <Line type="monotone" dataKey="observed_citations" name="Observed citations" stroke="#16a34a" dot={false} />
              <Line type="monotone" dataKey="ai_referral_sessions" name="AI referral sessions" stroke="#f59e0b" dot={false} />
              <Line
                type="monotone"
                dataKey="synthetic_mentions"
                name="Test mentions (sample)"
                stroke="#a855f7"
                strokeDasharray="4 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="tests">Tests</TabsTrigger>
          <TabsTrigger value="sources">Data sources</TabsTrigger>
          <TabsTrigger value="scope">What this shows</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="mt-4">
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Verified fetches</th>
                  <th className="px-4 py-3">Observed citations</th>
                  <th className="px-4 py-3">Referral sessions</th>
                  <th className="px-4 py-3">Test mention rate</th>
                  <th className="px-4 py-3">Sample</th>
                </tr>
              </thead>
              <tbody>
                {data.providers.map((row) => (
                  <tr key={row.provider} className="border-b last:border-0">
                    <td className="px-4 py-3">{row.label}</td>
                    <td className="px-4 py-3 tabular-nums">{row.observedFetches ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{row.observedCitations ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.provider === "crawler" || row.provider === "other" ? "—" : (row.referralSessions ?? 0)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.syntheticMentionRate === null
                        ? row.provider === "anthropic" || row.provider === "perplexity"
                          ? "Needs own key"
                          : row.provider === "crawler" || row.provider === "other" || row.provider === "microsoft"
                            ? "—"
                            : "No tests yet"
                        : formatRate(row.syntheticMentionRate)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {row.sampleSize ? `n = ${row.sampleSize}` : "No tests"}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={provider} onValueChange={(v) => setProvider(v as ProviderId | "all")}>
              <SelectTrigger className="w-44" aria-label="Provider filter">
                <SelectValue placeholder="All providers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {data.availableFilters.providers.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROVIDER_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={evidence} onValueChange={(v) => setEvidence(v as EvidenceType | "all")}>
              <SelectTrigger className="w-44" aria-label="Evidence filter">
                <SelectValue placeholder="All evidence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All evidence types</SelectItem>
                {(["observed", "attributed", "synthetic"] as EvidenceType[]).map((e) => (
                  <SelectItem key={e} value={e}>
                    {EVIDENCE_LABEL[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={(v) => setSource(v as SourceType | "all")}>
              <SelectTrigger className="w-52" aria-label="Source filter">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {data.dataSources.map((s) => (
                  <SelectItem key={s.source} value={s.source}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Evidence</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Surface</th>
                  <th className="px-4 py-3">URL / path</th>
                  <th className="px-4 py-3">Verified</th>
                </tr>
              </thead>
              <tbody>
                {citations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No measured events in this period.
                    </td>
                  </tr>
                ) : (
                  citations.slice(0, 100).map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-3 text-xs">{formatLocal(row.occurredAt)}</td>
                      <td className="px-4 py-3">
                        <EvidenceBadge evidence={row.evidence} />
                      </td>
                      <td className="px-4 py-3 text-xs">{PROVIDER_LABEL[row.provider]}</td>
                      <td className="px-4 py-3 text-xs">{row.surface ?? "—"}</td>
                      <td className="max-w-[22rem] truncate px-4 py-3 text-xs">{row.url ?? row.prompt ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">{row.verified ? "Verified bot" : "Unverified"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="tests" className="mt-4 space-y-4">
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">Controlled AI visibility tests</h2>
                <p className="text-xs text-muted-foreground">
                  A sample from versioned test prompts — never a measurement of real user conversations.
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={props.pending === "ai_probes"} onClick={() => void props.onSync("ai_probes")}>
                {props.pending === "ai_probes" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Run tests
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {data.rates.map((rate) => (
                <div key={rate.key} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{rate.label}</p>
                  <p className="text-xl font-semibold tabular-nums">{formatRate(rate.rate)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    n = {rate.n}
                    {rate.ciLow !== null && rate.ciHigh !== null
                      ? ` · 95 % CI ${Math.round(rate.ciLow * 1000) / 10}–${Math.round(rate.ciHigh * 1000) / 10} %`
                      : ""}
                    {rate.preliminary ? " · preliminary" : ""}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="mt-4 space-y-3">
          {data.dataSources.map((row) => (
            <Card key={row.source} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">{row.label}</h3>
                  <EvidenceBadge evidence={row.evidence} />
                  <Badge variant={row.status === "connected" || row.status === "built_in" ? "secondary" : "outline"}>
                    {CONNECTOR_STATUS_LABEL[row.status]}
                  </Badge>
                </div>
                {row.canSync ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={props.pending === row.source}
                    onClick={() => void props.onSync(row.source as "search_console" | "ai_probes")}
                  >
                    {props.pending === row.source ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Sync now
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">{row.setupHint}</p>
              {row.source === "search_console" || row.source === "ai_probes" ? (
                <div className="space-y-2">
                  <Button
                    size="sm"
                    disabled={props.pending === `connect:${row.source}`}
                    onClick={async () => {
                      const result = await props.onConnect(row.source as "search_console" | "ai_probes");
                      setChoices((current) => ({ ...current, [row.source]: result.choices ?? null }));
                    }}
                  >
                    {props.pending === `connect:${row.source}` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plug className="mr-2 h-4 w-4" />
                    )}
                    {row.status === "connected" ? "Reconnect" : "Connect with one click"}
                  </Button>
                  {choices[row.source]?.length ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select
                        onValueChange={async (value) => {
                          const result = await props.onConnect(row.source as "search_console" | "ai_probes", value);
                          if (result.ok) setChoices((current) => ({ ...current, [row.source]: null }));
                        }}
                      >
                        <SelectTrigger className="sm:w-96">
                          <SelectValue placeholder="Choose a verified property" />
                        </SelectTrigger>
                        <SelectContent>
                          {(choices[row.source] ?? []).map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                Last sync: {formatLocal(row.lastSyncedAt)} · Next: {formatLocal(row.nextSyncAt)} · Imported:{" "}
                {row.recordsImported ?? "—"}
              </p>
              {row.error ? <p className="text-[11px] text-destructive">{row.error}</p> : null}
              {row.configLabel ? (
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const input = new FormData(event.currentTarget).get("value");
                    void props.onSaveSource(row.source as "search_console", String(input ?? ""));
                  }}
                >
                  <Input
                    name="value"
                    defaultValue={row.configValue ?? ""}
                    placeholder={row.configLabel}
                    aria-label={row.configLabel}
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    Save
                  </Button>
                </form>
              ) : null}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="scope" className="mt-4 grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <h3 className="text-sm font-medium">What this dashboard shows</h3>
            <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
              {WHAT_THIS_SHOWS.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-medium">What is not measurable</h3>
            <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
              {WHAT_IS_NOT_MEASURABLE.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
