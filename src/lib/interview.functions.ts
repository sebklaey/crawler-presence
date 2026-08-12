/**
 * Website-Interview ohne eigenes AI-Modell.
 *
 * Crawler betreibt kein eigenes Sprachmodell mehr. Die Website führt ein
 * deterministisches, lückengesteuertes Interview; die adaptive, frei
 * formulierte Variante läuft über ChatGPT (MCP-Endpunkt /mcp).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { interviewStep, normalizeCore, reviewCore } from "./interview-rules";

export const interviewTurn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        message: z.string().min(1).max(6000),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) }))
          .max(40)
          .default([]),
        core: z.unknown().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const step = interviewStep({ core: data.core, message: data.message });
    return {
      reply: step.reply,
      question: step.question,
      suggestions: step.suggestions,
      core: step.core,
    };
  });

export const improvePresence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ core: z.unknown() }).parse(input))
  .handler(async ({ data }) => {
    const review = reviewCore(normalizeCore(data.core));
    return {
      headline: review.headline,
      strengths: review.strengths,
      missing: review.missing,
      suggestions: review.suggestions,
    };
  });
