/**
 * Analytics-Antworten ohne eigenes AI-Modell.
 *
 * Crawler betreibt kein eigenes Sprachmodell. Fragen werden deterministisch
 * über erkannte Intents auf die tatsächlich gemessenen Zahlen abgebildet.
 * Formulierungen bleiben streng bei „gemessen innerhalb von Crawler".
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CAVEAT =
  "Gemessen ausschließlich innerhalb von Crawler: eigene Tool-Aufrufe, Abrufe der veröffentlichten Presence-Dateien und trackbare Outbound-Klicks. Private Unterhaltungen in ChatGPT, Claude, Gemini oder anderen Assistenten sind nicht enthalten und nicht messbar.";

type Dataset = {
  presence?: string;
  range_days?: number;
  totals?: Record<string, number>;
  daily?: { date: string; [k: string]: string | number }[];
  file_reads?: { path?: string; label?: string; count?: number }[];
  sources?: { label?: string; source?: string; count?: number }[];
  data_since?: string | null;
};

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function totalsList(d: Dataset) {
  return Object.entries(d.totals ?? {}).map(([label, value]) => ({
    label: label.replace(/_/g, " "),
    value: String(num(value)),
  }));
}

const answerSchema = z.object({
  intent: z.string(),
  answer: z.string(),
  metrics: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  caveat: z.string().default(""),
});
export type AnalyticsAnswer = z.infer<typeof answerSchema>;

/** Deterministische Intent-Erkennung über Schlüsselwörter. */
function detectIntent(question: string) {
  const q = question.toLowerCase();
  if (/(datei|file|llms|markdown|json|read|abruf|gelesen)/.test(q)) return "file_reads" as const;
  if (/(klick|click|link|outbound)/.test(q)) return "clicks" as const;
  if (/(quelle|source|woher)/.test(q)) return "sources" as const;
  if (/(trend|verlauf|pro tag|daily|täglich)/.test(q)) return "trend" as const;
  if (/(erwähn|mention|gesprochen|talked|geredet|oft)/.test(q)) return "mentions" as const;
  return "overview" as const;
}

export const askAnalytics = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ question: z.string().min(2).max(500), dataset: z.unknown() }).parse(input),
  )
  .handler(async ({ data }): Promise<AnalyticsAnswer> => {
    const d = (data.dataset ?? {}) as Dataset;
    const window = `letzte ${num(d.range_days) || 7} Tage`;
    const intent = detectIntent(data.question);
    const totals = d.totals ?? {};
    const mentions = num(totals["mentions"] ?? totals["mention_events"] ?? totals["conversations"]);
    const reads = num(totals["reads"] ?? totals["crawler_reads"] ?? totals["file_reads"]);
    const clicks = num(totals["clicks"] ?? totals["outbound_clicks"]);

    if (intent === "file_reads") {
      const files = (d.file_reads ?? []).slice(0, 6);
      return {
        intent: "Presence-Dateizugriffe",
        answer: files.length
          ? `Im Zeitraum ${window} wurden ${reads} Dateizugriffe gemessen. Am häufigsten abgerufen: ${files
              .map((f) => `${f.path ?? f.label} (${num(f.count)})`)
              .join(", ")}. Ein Abruf ist kein Nachweis einer Zitierung.`
          : `Im Zeitraum ${window} wurden keine Dateizugriffe gemessen.`,
        metrics: files.map((f) => ({ label: String(f.path ?? f.label ?? "Datei"), value: String(num(f.count)) })),
        caveat: CAVEAT,
      };
    }

    if (intent === "clicks") {
      return {
        intent: "Outbound-Klicks",
        answer: `Im Zeitraum ${window} wurden ${clicks} trackbare Klicks auf deine Links gemessen.`,
        metrics: [{ label: "Outbound-Klicks", value: String(clicks) }],
        caveat: CAVEAT,
      };
    }

    if (intent === "sources") {
      const sources = (d.sources ?? []).slice(0, 8);
      return {
        intent: "Quellenverteilung",
        answer: sources.length
          ? `Gemessene Ereignisse verteilen sich im Zeitraum ${window} auf: ${sources
              .map((s) => `${s.label ?? s.source} (${num(s.count)})`)
              .join(", ")}.`
          : `Für ${window} sind keine Quellen mit Ereignissen erfasst.`,
        metrics: sources.map((s) => ({ label: String(s.label ?? s.source ?? "Quelle"), value: String(num(s.count)) })),
        caveat: CAVEAT,
      };
    }

    if (intent === "trend") {
      const daily = d.daily ?? [];
      const half = Math.floor(daily.length / 2);
      const sum = (rows: typeof daily) =>
        rows.reduce((acc, r) => acc + Object.entries(r).reduce((a, [k, v]) => (k === "date" ? a : a + num(v)), 0), 0);
      const first = sum(daily.slice(0, half));
      const second = sum(daily.slice(half));
      const direction = second > first ? "steigend" : second < first ? "fallend" : "stabil";
      return {
        intent: "Zeitlicher Verlauf",
        answer: daily.length
          ? `Der Verlauf über ${window} ist ${direction}: ${first} Ereignisse in der ersten Hälfte, ${second} in der zweiten.`
          : `Für ${window} liegen keine Tageswerte vor.`,
        metrics: [
          { label: "Erste Hälfte", value: String(first) },
          { label: "Zweite Hälfte", value: String(second) },
        ],
        caveat: CAVEAT,
      };
    }

    if (intent === "mentions") {
      return {
        intent: "Beobachtete Erwähnungen",
        answer: `Im Zeitraum ${window} wurden ${mentions} Erwähnungs-Events innerhalb von Crawler gemessen${
          d.presence ? ` für ${d.presence}` : ""
        }. Das sind beobachtete Crawler-Ereignisse, keine Aussage über Menschen oder Gespräche außerhalb von Crawler.`,
        metrics: [{ label: "Erwähnungs-Events", value: String(mentions) }],
        caveat: CAVEAT,
      };
    }

    const metrics = totalsList(d);
    return {
      intent: "Überblick",
      answer: metrics.length
        ? `Überblick für ${window}${d.presence ? ` (${d.presence})` : ""}: ${metrics
            .map((m) => `${m.label} ${m.value}`)
            .join(", ")}.${d.data_since ? ` Datenerfassung seit ${new Date(d.data_since).toLocaleDateString("de-DE")}.` : ""}`
        : `Für ${window} wurden keine Ereignisse gemessen.`,
      metrics,
      caveat: CAVEAT,
    };
  });

const summarySchema = z.object({
  headline: z.string(),
  recurringQuestions: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
  improvements: z.array(z.object({ action: z.string(), impact: z.string() })).default([]),
});
export type AnalyticsSummary = z.infer<typeof summarySchema>;

export const analyticsSummary = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ dataset: z.unknown() }).parse(input))
  .handler(async ({ data }): Promise<AnalyticsSummary> => {
    const d = (data.dataset ?? {}) as Dataset;
    const window = `letzte ${num(d.range_days) || 7} Tage`;
    const totals = d.totals ?? {};
    const mentions = num(totals["mentions"] ?? totals["mention_events"] ?? totals["conversations"]);
    const reads = num(totals["reads"] ?? totals["crawler_reads"] ?? totals["file_reads"]);
    const clicks = num(totals["clicks"] ?? totals["outbound_clicks"]);
    const files = (d.file_reads ?? []).slice(0, 5);

    const improvements: { action: string; impact: string }[] = [];
    if (mentions > 0 && reads === 0)
      improvements.push({
        action: "Verlinke die Presence-Dateien deutlicher (llms.txt, about.md, faq.md).",
        impact: "Die Presence wird referenziert, aber die Dateien werden nicht gelesen.",
      });
    if (reads > 0 && clicks === 0)
      improvements.push({
        action: "Ergänze klare Kontakt- und Ziel-Links im Knowledge Core.",
        impact: "Dateien werden gelesen, aber es entstehen keine messbaren Weiterleitungen.",
      });
    if (files.some((f) => /faq/.test(String(f.path ?? f.label ?? ""))))
      improvements.push({
        action: "Erweitere die FAQ um die am häufigsten abgerufenen Themen.",
        impact: "faq.md gehört zu den meistgelesenen Dateien.",
      });
    if (!improvements.length)
      improvements.push({
        action: "Ergänze fehlende nachprüfbare Fakten im Knowledge Core.",
        impact: "Mehr belegte Angaben erhöhen die Chance, korrekt wiedergegeben zu werden.",
      });

    return {
      headline:
        mentions + reads + clicks === 0
          ? `Für ${window} wurden keine Ereignisse gemessen.`
          : `${window}: ${mentions} Erwähnungs-Events, ${reads} Dateizugriffe, ${clicks} Outbound-Klicks — gemessen innerhalb von Crawler.`,
      recurringQuestions: files.map((f) => String(f.path ?? f.label ?? "")).filter(Boolean),
      missingInformation:
        reads === 0 ? ["Noch keine gemessenen Dateizugriffe — die Presence wird selten direkt gelesen."] : [],
      improvements,
    };
  });
