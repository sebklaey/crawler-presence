import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell, PageHead } from "@/components/app-shell";
import { ScopeNotice } from "@/components/visibility-dashboard";
import { PERIODS, type Period } from "@/lib/visibility/model";
import { publicVisibilityFn } from "@/lib/visibility.functions";

export const Route = createFileRoute("/p/$slug/analytics")({
  loader: ({ params }) => publicVisibilityFn({ data: { slug: params.slug, period: 30 } }),
  head: ({ loaderData }) => {
    const name = loaderData && "name" in loaderData ? loaderData.name : "Presence";
    return {
      meta: [
        { title: `Öffentliche Analytics — ${name} | Crawler` },
        {
          name: "description",
          content: `Aggregierte, in Crawler beobachtete Kennzahlen für ${name}: anonyme Crawler-Sessions, Mention-Events und öffentliche Presence-Dateizugriffe.`,
        },
        { property: "og:title", content: `Öffentliche Analytics — ${name}` },
        {
          property: "og:description",
          content: "Aggregierte, innerhalb von Crawler gemessene Sichtbarkeitswerte dieser Presence.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  errorComponent: () => (
    <AppShell>
      <div className="mx-auto max-w-2xl px-5 py-24 text-sm text-muted-foreground">
        Analytics sind momentan nicht verfügbar.
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="mx-auto max-w-2xl px-5 py-24 text-sm text-muted-foreground">Presence nicht gefunden.</div>
    </AppShell>
  ),
  component: PublicAnalytics,
});

function PublicAnalytics() {
  const initial = Route.useLoaderData();
  const { slug } = Route.useParams();
  const [period, setPeriod] = useState<Period>(30);
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function changePeriod(next: Period) {
    setPeriod(next);
    setBusy(true);
    try {
      setData(await publicVisibilityFn({ data: { slug, period: next } }));
    } finally {
      setBusy(false);
    }
  }

  if (!data.found) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-5 py-24 text-sm text-muted-foreground">
          Für „{slug}" gibt es keine veröffentlichte Presence.
        </div>
      </AppShell>
    );
  }

  const s = data.summary;
  const cards = [
    {
      label: "Unterschiedliche anonyme Sessions",
      value: s.distinctSessions,
      definition: "Anonyme Crawler-Sessions, die diese Presence referenziert haben.",
    },
    {
      label: "Beobachtete Mention-Events",
      value: s.mentionEvents,
      definition: "Einzelne Crawler-Tool-Aufrufe, die diese Presence referenziert haben.",
    },
    {
      label: "Öffentliche Presence-Dateizugriffe",
      value: s.presenceReads,
      definition: "Abrufe der veröffentlichten Dateien (llms.txt, Markdown, JSON).",
    },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-14">
        <PageHead
          eyebrow="Öffentliche Analytics"
          title={data.name}
          description="Aggregierte, innerhalb von Crawler beobachtete Werte. Detaillierte Quellen, URLs, Zeitreihen und Insights bleiben geschützt."
        />

        <div className="mb-6 flex flex-wrap gap-1" role="group" aria-label="Zeitraum">
          {PERIODS.map((p) => (
            <button
              key={String(p.value)}
              type="button"
              onClick={() => void changePeriod(p.value)}
              disabled={busy}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                period === p.value ? "border-foreground text-foreground" : "border-border text-muted-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl border border-border/70 p-4">
              <h2 className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</h2>
              <p className="display mt-3 text-3xl tabular-nums">{c.value}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{c.definition}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Zeitraum: {period === "all" ? "gesamter Zeitraum" : `letzte ${period} Tage`} · Datenerfassung seit:{" "}
          {s.dataSince ? new Date(s.dataSince).toLocaleDateString("de-DE") : "noch keine Ereignisse"}
        </p>

        <div className="mt-6">
          <ScopeNotice text={s.scopeNotice} />
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          <Link to="/p/$slug" params={{ slug }} className="underline underline-offset-4">
            Zur öffentlichen Presence
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
