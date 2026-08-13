import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell, PageHead } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScopeNotice, VisibilityDashboardView } from "@/components/visibility-dashboard";
import { SCOPE_NOTICE, type EventType, type Period, type SourceType, type VisibilityDashboard } from "@/lib/visibility/model";
import { visibilityConnectSourceFn, visibilityDashboardFn, visibilityExportFn } from "@/lib/visibility.functions";
import { useRecoveryCode } from "@/lib/store";

export const Route = createFileRoute("/manage_/$slug/analytics")({
  head: () => ({
    meta: [
      { title: "AI Visibility Analytics — Crawler" },
      {
        name: "description",
        content:
          "Observed mentions, Presence file reads, connected sources and controlled AI benchmarks for your Crawler Presence — each metric with source, period and measurement limits.",
      },
      { property: "og:title", content: "AI Visibility Analytics — Crawler" },
      {
        property: "og:description",
        content: "Transparent, measurable visibility analytics for a published Crawler Presence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VisibilityPage,
});

const REASONS: Record<string, string> = {
  "invalid-code": "That does not look like a Crawler recovery code (format: slug~crw_…).",
  "not-found": "No Presence access for this code.",
  "rate-limited": "Too many requests. Please wait a moment.",
  unavailable: "Analytics are temporarily unavailable. Nothing was changed.",
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
          setError(REASONS[result.reason] ?? "Analytics could not be loaded.");
          return;
        }
        setData(result.dashboard as VisibilityDashboard);
        setName(result.name);
        setMaxDays(result.maxDays);
      } catch {
        setError("Analytics could not be loaded.");
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
        toast.error("Export failed.");
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
      toast.error("Export failed.");
    }
  }

  async function onConnect(input: { source: string; connected: boolean; value?: string }) {
    const activeCode = storedCode || code;
    try {
      const result = await visibilityConnectSourceFn({
        data: {
          code: activeCode,
          source: input.source as "authorized_ai" | "public_web" | "search_console" | "visibility_benchmark" | "user_reported",
          connected: input.connected,
          ...(input.value ? { value: input.value } : {}),
        },
      });
      if (!result.ok) {
        toast.error(REASONS[result.reason] ?? "Could not update this source.");
        return;
      }
      toast.success(input.connected ? "Source connected." : "Source disconnected.");
      await load(activeCode);
    } catch {
      toast.error("Could not update this source.");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="AI Visibility Analytics"
          title={name}
          description="Observed mentions, file reads, connected sources and controlled benchmarks — every number with its source, period and definition."
        />

        <p className="mb-6 text-xs text-muted-foreground">
          <Link to="/manage" className="underline underline-offset-4">
            Back to Presence management
          </Link>{" "}
          · public summary view:{" "}
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
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        ) : null}

        {busy && !data ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…
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
            onConnect={onConnect}
          />
        ) : null}
      </div>
    </AppShell>
  );
}
