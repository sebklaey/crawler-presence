import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell, PageHead } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScopeNotice, VisibilityDashboardView } from "@/components/visibility-dashboard";
import { SCOPE_NOTICE, type EventType, type Period, type SourceType, type VisibilityDashboard } from "@/lib/visibility/model";
import { visibilityDashboardFn, visibilityExportFn } from "@/lib/visibility.functions";
import { useRecoveryCode } from "@/lib/store";

export const Route = createFileRoute("/manage_/$slug/analytics")({
  head: () => ({
    meta: [
      { title: "AI Visibility Analytics — Crawler" },
      {
        name: "description",
        content:
          "Beobachtete Erwähnungen, Presence-Dateizugriffe, verbundene Quellen und kontrollierte AI-Benchmarks deiner Crawler Presence — mit Quelle, Zeitraum und Messgrenze je Kennzahl.",
      },
      { property: "og:title", content: "AI Visibility Analytics — Crawler" },
      {
        property: "og:description",
        content: "Transparente, messbare Sichtbarkeitsanalyse für eine veröffentlichte Crawler Presence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VisibilityPage,
});

const REASONS: Record<string, string> = {
  "invalid-code": "Das sieht nicht nach einem Crawler-Recovery-Code aus (Form: slug~crw_…).",
  "not-found": "Kein Presence-Zugang für diesen Code.",
  "rate-limited": "Zu viele Anfragen. Bitte kurz warten.",
  unavailable: "Analytics sind momentan nicht verfügbar. Es wurde nichts verändert.",
};

function VisibilityPage() {
  const { slug } = Route.useParams();
  const [storedCode, setStoredCode, hydrated] = useRecoveryCode();
  const [code, setCode] = useState("");
  const [data, setData] = useState<VisibilityDashboard | null>(null);
  const [name, setName] = useState<string>(slug);
  const [maxDays, setMaxDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ period: Period; source: SourceType | "all"; eventType: EventType | "all" }>({
    period: 30,
    source: "all",
    eventType: "all",
  });

  const load = useCallback(
    async (activeCode: string, next = filters) => {
      if (!activeCode) return;
      setBusy(true);
      setError(null);
      try {
        const result = await visibilityDashboardFn({
          data: {
            code: activeCode,
            period: next.period,
            source: next.source === "all" ? undefined : next.source,
            eventType: next.eventType === "all" ? undefined : next.eventType,
          },
        });
        if (!result.ok) {
          setData(null);
          setError(REASONS[result.reason] ?? "Analytics konnten nicht geladen werden.");
          return;
        }
        setData(result.dashboard as VisibilityDashboard);
        setName(result.name);
        setMaxDays(result.maxDays);
      } catch {
        setError("Analytics konnten nicht geladen werden.");
      } finally {
        setBusy(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    if (hydrated && storedCode) void load(storedCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, storedCode]);

  function onFilterChange(next: Partial<typeof filters>) {
    const merged = { ...filters, ...next };
    setFilters(merged);
    void load(storedCode || code, merged);
  }

  async function onExport() {
    const activeCode = storedCode || code;
    try {
      const result = await visibilityExportFn({ data: { code: activeCode } });
      if (!result.ok) {
        toast.error("Export nicht möglich.");
        return;
      }
      const blob = new Blob([JSON.stringify(result.export, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `crawler-analytics-${slug}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export nicht möglich.");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="AI Visibility Analytics"
          title={name}
          description="Beobachtete Erwähnungen, Dateizugriffe, verbundene Quellen und kontrollierte Benchmarks — jede Zahl mit Quelle, Zeitraum und Definition."
        />

        <p className="mb-6 text-xs text-muted-foreground">
          <Link to="/manage" className="underline underline-offset-4">
            Zurück zur Presence-Verwaltung
          </Link>{" "}
          · öffentliche Kurzansicht:{" "}
          <Link to="/p/$slug/analytics" params={{ slug }} className="underline underline-offset-4">
            /p/{slug}/analytics
          </Link>
        </p>

        {!storedCode && !data ? (
          <div className="space-y-4">
            <ScopeNotice text={SCOPE_NOTICE} />
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                setStoredCode(code);
                void load(code);
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="slug~crw_…"
                aria-label="Recovery-Code"
                autoComplete="off"
              />
              <Button type="submit" disabled={busy || code.length < 10}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analytics öffnen"}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Der Recovery-Code wird nur zur Prüfung an den Server gesendet — nie in die URL geschrieben, nie geloggt.
            </p>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        ) : null}

        {busy && !data ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Analytics werden geladen…
          </div>
        ) : null}

        {error && data === null && storedCode ? (
          <div className="rounded-xl border border-destructive/40 px-4 py-6 text-sm text-destructive">{error}</div>
        ) : null}

        {data ? (
          <VisibilityDashboardView
            data={data}
            filters={filters}
            maxDays={maxDays}
            onFilterChange={onFilterChange}
            onExport={onExport}
          />
        ) : null}
      </div>
    </AppShell>
  );
}
