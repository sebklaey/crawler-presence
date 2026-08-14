import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InsightsDashboardView } from "@/components/insights-dashboard";
import { AiAnalyticsDashboardView } from "@/components/ai-analytics-dashboard";
import { MEASUREMENT_NOTICE, type InsightsDashboard, type InsightsPeriod } from "@/lib/insights/model";
import { insightsDashboardFn } from "@/lib/insights.functions";
import type { AiAnalyticsDashboard, AnalyticsPeriod } from "@/lib/analytics/model";
import {
  aiAnalyticsDashboardFn,
  exportAnalyticsCsvFn,
  importBingCsvFn,
  saveAnalyticsSourceFn,
  syncAnalyticsSourceFn,
} from "@/lib/ai-analytics.functions";
import { decideRecommendationFn } from "@/lib/retention.functions";
import { useRecoveryCode } from "@/lib/store";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "AI Presence Analytics — Crawler" },
      {
        name: "description",
        content:
          "Measured accesses to your published information, most-read content, detected sources and free Knowledge Core improvements.",
      },
      { property: "og:title", content: "AI Presence Analytics — Crawler" },
      {
        property: "og:description",
        content: "Activity of your AI Presence measured by Crawler — transparent, verifiable and without ranking promises.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

const REASONS: Record<string, string> = {
  "invalid-code": "That does not look like a Crawler recovery code (format: slug~crw_…).",
  "not-found": "No Presence access for this code.",
  "rate-limited": "Too many requests. Please wait a moment.",
  unavailable: "Analytics are temporarily unavailable. Nothing was changed.",
};

function AnalyticsPage() {
  const [storedCode, setStoredCode, hydrated] = useRecoveryCode();
  const [code, setCode] = useState("");
  const [data, setData] = useState<InsightsDashboard | null>(null);
  const [period, setPeriod] = useState<InsightsPeriod>(30);
  const [busy, setBusy] = useState(false);
  const [improving, setImproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiData, setAiData] = useState<AiAnalyticsDashboard | null>(null);
  const [aiPeriod, setAiPeriod] = useState<AnalyticsPeriod>(30);
  const [aiBusy, setAiBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async (activeCode: string, nextPeriod: InsightsPeriod) => {
    if (!activeCode) return;
    setBusy(true);
    setError(null);
    try {
      const result = await insightsDashboardFn({ data: { code: activeCode, period: nextPeriod } });
      if (!result.ok) {
        setData(null);
        setError(REASONS[result.reason] ?? "Analytics could not be loaded.");
        return;
      }
      setData(result.dashboard);
      setPeriod(result.dashboard.period);
    } catch {
      setError("Analytics could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, []);

  const loadAi = useCallback(async (activeCode: string, nextPeriod: AnalyticsPeriod) => {
    if (!activeCode) return;
    setAiBusy(true);
    try {
      const result = await aiAnalyticsDashboardFn({ data: { code: activeCode, period: nextPeriod } });
      if (result.ok) {
        setAiData(result.dashboard);
        setAiPeriod(result.dashboard.period);
      }
    } catch {
      /* the insights dashboard above stays usable */
    } finally {
      setAiBusy(false);
    }
  }, []);

  useEffect(() => {
    if (hydrated && storedCode) {
      void load(storedCode, 30);
      void loadAi(storedCode, 30);
    }
  }, [hydrated, storedCode, load, loadAi]);

  const activeCode = storedCode || code;

  async function runAction(key: string, action: () => Promise<{ ok: boolean; message: string }>) {
    setPending(key);
    try {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      await loadAi(activeCode, aiPeriod);
    } catch {
      toast.error("The action failed. Nothing was changed.");
    } finally {
      setPending(null);
    }
  }

  async function onExport() {
    const result = await exportAnalyticsCsvFn({ data: { code: activeCode, period: aiPeriod } });
    if (!result.ok) {
      toast.error("The export could not be created.");
      return;
    }
    const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `crawler-ai-analytics-${aiPeriod}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onImprove(value: string): Promise<boolean> {
    if (!data?.nextImprovement) return false;
    setImproving(true);
    try {
      const result = await decideRecommendationFn({
        data: { code: activeCode, id: data.nextImprovement.id, decision: "approve", value },
      });
      if (!result.ok) {
        toast.error("message" in result ? result.message : (REASONS[result.reason] ?? "The change could not be published."));
        return false;
      }
      await load(activeCode, period);
      return true;
    } catch {
      toast.error("The change could not be published.");
      return false;
    } finally {
      setImproving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-5 pb-24 pt-14">
        {!storedCode && !data ? (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold tracking-tight">Your AI Presence is being seen</h1>
            <p className="text-sm text-muted-foreground">{MEASUREMENT_NOTICE}</p>
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                setStoredCode(code);
                void load(code, period);
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="slug~crw_…"
                aria-label="Recovery code"
                autoComplete="off"
              />
              <Button type="submit" disabled={busy || code.length < 10}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open analytics"}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              The recovery code is only sent to the server for verification — never written into the URL, never logged.
            </p>
            <p className="text-xs text-muted-foreground">
              Not published yet?{" "}
              <Link to="/publish" className="underline underline-offset-4">
                Review and publish Presence
              </Link>
            </p>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        ) : null}

        {busy && !data ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…
          </div>
        ) : null}

        {error && data === null && storedCode ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-destructive/40 px-4 py-6 text-sm text-destructive">{error}</div>
            <div className="rounded-xl border bg-card px-5 py-8 text-center">
              <h2 className="text-lg font-medium">Publish your Presence to start analytics</h2>
              <Button asChild className="mt-4">
                <Link to="/publish">Review and publish Presence</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {data ? (
          <>
            <InsightsDashboardView
              data={data}
              period={period}
              onPeriodChange={(next) => {
                setPeriod(next);
                void load(activeCode, next);
              }}
              onImprove={onImprove}
              improving={improving}
              busy={busy}
            />
            {aiData ? (
              <div className="mt-14 border-t pt-12">
                <AiAnalyticsDashboardView
                  data={aiData}
                  period={aiPeriod}
                  busy={aiBusy}
                  pending={pending}
                  onPeriodChange={(next) => {
                    setAiPeriod(next);
                    void loadAi(activeCode, next);
                  }}
                  onSync={(source) =>
                    runAction(source, () => syncAnalyticsSourceFn({ data: { code: activeCode, source } }))
                  }
                  onSaveSource={(source, value) =>
                    runAction(source, () => saveAnalyticsSourceFn({ data: { code: activeCode, source, value } }))
                  }
                  onConnect={async (source, choice) => {
                    setPending(`connect:${source}`);
                    try {
                      const result = await connectAnalyticsSourceFn({
                        data: { code: activeCode, source, ...(choice ? { choice } : {}) },
                      });
                      if (result.ok) toast.success(result.message);
                      else if (!result.choices?.length) toast.error(result.message);
                      else toast.message(result.message);
                      if (result.ok) await loadAi(activeCode, aiPeriod);
                      return { ok: result.ok, ...(result.choices ? { choices: result.choices } : {}) };
                    } catch {
                      toast.error("The connection failed. Nothing was changed.");
                      return { ok: false };
                    } finally {
                      setPending(null);
                    }
                  }}
                  onImportCsv={(csv) =>
                    runAction("bing_csv", () => importBingCsvFn({ data: { code: activeCode, csv } }))
                  }
                  onExport={onExport}
                />
              </div>
            ) : null}
            <p className="mt-8 text-xs text-muted-foreground">
              <Link to="/manage" className="underline underline-offset-4">
                Back to Presence management
              </Link>
            </p>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
