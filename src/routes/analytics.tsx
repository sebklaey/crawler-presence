import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InsightsDashboardView } from "@/components/insights-dashboard";
import { MEASUREMENT_NOTICE, type InsightsDashboard, type InsightsPeriod } from "@/lib/insights/model";
import { insightsDashboardFn } from "@/lib/insights.functions";
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

  useEffect(() => {
    if (hydrated && storedCode) void load(storedCode, 30);
  }, [hydrated, storedCode, load]);

  const activeCode = storedCode || code;

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
            <p className="mt-8 text-xs text-muted-foreground">
              <Link to="/manage" className="underline underline-offset-4">
                Back to Presence management
              </Link>
              {" · "}
              <Link to="/p/$slug/analytics" params={{ slug: data.slug }} className="underline underline-offset-4">
                Public summary
              </Link>
            </p>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
