/**
 * Kontrollierter AI Visibility Benchmark.
 *
 * Ein festes Set neutraler Testfragen wird an ein ausgewähltes Modell
 * geschickt. Gespeichert wird ausschließlich das ausgewertete Ergebnis
 * (erwähnt / sachlich korrekt / Quelle genannt / erkannte Fehlinterpretationen),
 * niemals der vollständige Prompt oder die vollständige Antwort.
 *
 * Das ist ausdrücklich KEINE Messung realer Nutzergespräche.
 */
import { z } from "zod";

export const BENCHMARK_VERSION = "v1";

export const BENCHMARK_PROMPTS: { key: string; question: string }[] = [
  { key: "what_is", question: "Was ist Crawler?" },
  { key: "tools_knowledge_core", question: "Welche Tools erstellen AI-lesbare Knowledge Cores?" },
  { key: "is_scraper", question: "Ist Crawler ein Web-Scraper?" },
  { key: "audience", question: "Für wen eignet sich Crawler?" },
  { key: "output_formats", question: "Welche Ausgabeformate bietet Crawler?" },
];

const evaluationSchema = z.object({
  entity_mentioned: z.boolean(),
  description_correct: z.boolean(),
  source_cited: z.boolean(),
  position: z.number().int().min(1).max(50).nullable().default(null),
  detected_issues: z.array(z.string()).max(5).default([]),
  result_summary: z.string().max(400),
});

export type BenchmarkOutcome = z.infer<typeof evaluationSchema> & {
  provider: string;
  model: string;
  prompt_key: string;
};

/**
 * Crawler betreibt kein eigenes Sprachmodell und kann den Benchmark daher
 * nicht selbst ausführen. Die Testfragen werden vom verbundenen Assistenten
 * (ChatGPT über MCP) beantwortet und bewertet; hier werden ausschließlich die
 * eingereichten Bewertungen gespeichert — niemals Prompt oder Antworttext.
 */
export const BENCHMARK_UNAVAILABLE =
  "Crawler nutzt kein eigenes AI-Modell. Der kontrollierte Benchmark wird vom verbundenen Assistenten (ChatGPT über MCP) ausgeführt; Crawler speichert nur die eingereichten Bewertungen.";

export async function runBenchmark(_slug: string, _entityName: string): Promise<{ runs: number; error?: string }> {
  return { runs: 0, error: BENCHMARK_UNAVAILABLE };
}

/** Speichert vom aufrufenden Assistenten eingereichte Benchmark-Bewertungen. */
export async function recordBenchmarkResults(
  slug: string,
  provider: string,
  model: string,
  results: unknown[],
): Promise<{ runs: number; error?: string }> {
  const { db } = await import("../mcp/db.server");
  const supabase = db();
  if (!supabase) return { runs: 0, error: "Datenbank nicht verfügbar." };

  const rows: Record<string, unknown>[] = [];
  for (const raw of results) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const promptKey = String(entry["prompt_key"] ?? "");
    if (!BENCHMARK_PROMPTS.some((p) => p.key === promptKey)) continue;
    const parsed = evaluationSchema.safeParse(entry);
    if (!parsed.success) continue;
    rows.push({
      presence_slug: slug,
      provider: provider.slice(0, 60),
      model: model.slice(0, 80),
      prompt_key: promptKey,
      prompt_version: BENCHMARK_VERSION,
      entity_mentioned: parsed.data.entity_mentioned,
      description_correct: parsed.data.description_correct,
      source_cited: parsed.data.source_cited,
      position: parsed.data.position,
      detected_issues: parsed.data.detected_issues,
      result_summary: parsed.data.result_summary.slice(0, 400),
    });
  }

  if (!rows.length) return { runs: 0, error: "Keine gültigen Benchmark-Bewertungen übermittelt." };
  const { error } = await supabase.from("visibility_benchmarks").insert(rows);
  if (error) return { runs: 0, error: "Benchmark-Ergebnisse konnten nicht gespeichert werden." };
  return { runs: rows.length };
}

