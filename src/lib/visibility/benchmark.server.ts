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

/** Führt das Prompt-Set aus und speichert nur die ausgewerteten Ergebnisse. */
export async function runBenchmark(slug: string, entityName: string): Promise<{ runs: number; error?: string }> {
  const { db } = await import("../mcp/db.server");
  const supabase = db();
  if (!supabase) return { runs: 0, error: "Datenbank nicht verfügbar." };

  let generateJson: typeof import("../ai-gateway.server").generateJson;
  let model: string;
  try {
    const gateway = await import("../ai-gateway.server");
    generateJson = gateway.generateJson;
    model = gateway.CRAWLER_MODEL;
  } catch {
    return { runs: 0, error: "AI-Gateway nicht verfügbar." };
  }

  const rows: Record<string, unknown>[] = [];
  for (const prompt of BENCHMARK_PROMPTS) {
    try {
      const evaluated = await generateJson({
        schema: evaluationSchema,
        shape: `{"entity_mentioned": true, "description_correct": true, "source_cited": false, "position": 1, "detected_issues": ["kurz benannte Fehlinterpretation"], "result_summary": "1-2 Sätze"}`,
        system: `Du beantwortest zuerst die Testfrage aus deinem eigenen Modellwissen und bewertest anschließend deine eigene Antwort in Bezug auf die Entität "${entityName}".
entity_mentioned: wurde die Entität in deiner Antwort genannt?
description_correct: war die Beschreibung sachlich korrekt?
source_cited: hast du eine Quelle der Entität angegeben?
position: an welcher Stelle einer Aufzählung erschien sie, sonst null.
detected_issues: kurze Stichworte zu Fehlinterpretationen, z.B. "als Web-Scraper eingeordnet".
Gib nur die Bewertung als JSON zurück, nicht die Antwort selbst.`,
        prompt: `Testfrage: ${prompt.question}`,
      });
      rows.push({
        presence_slug: slug,
        provider: "lovable-ai-gateway",
        model,
        prompt_key: prompt.key,
        prompt_version: BENCHMARK_VERSION,
        entity_mentioned: evaluated.entity_mentioned,
        description_correct: evaluated.description_correct,
        source_cited: evaluated.source_cited,
        position: evaluated.position,
        detected_issues: evaluated.detected_issues,
        result_summary: evaluated.result_summary.slice(0, 400),
      });
    } catch (error) {
      console.error("[crawler] benchmark run failed", prompt.key, String(error));
    }
  }

  if (!rows.length) return { runs: 0, error: "Kein Benchmark-Lauf konnte ausgewertet werden." };
  const { error } = await supabase.from("visibility_benchmarks").insert(rows);
  if (error) return { runs: 0, error: "Benchmark-Ergebnisse konnten nicht gespeichert werden." };
  return { runs: rows.length };
}
