import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { z } from "zod";

export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable-ai-gateway",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
  });
}

export function requireGateway() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key);
}

export const CRAWLER_MODEL = "google/gemini-3.6-flash";

function extractJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model returned no JSON");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Structured generation through the gateway. Uses plain text + tolerant parsing
 * because gateway chat models are not guaranteed to honour strict json_schema.
 */
export async function generateJson<T>({
  schema,
  shape,
  system,
  prompt,
}: {
  schema: z.ZodType<T>;
  /** Human-readable JSON shape shown to the model. */
  shape: string;
  system: string;
  prompt: string;
}): Promise<T> {
  const gateway = requireGateway();
  const model = gateway(CRAWLER_MODEL);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = await generateText({
      model,
      system: `${system}\n\nRespond with ONLY a valid JSON object, no prose, no code fences. Exact shape:\n${shape}`,
      prompt: attempt === 0 ? prompt : `${prompt}\n\nYour previous answer was not valid JSON. Return only the JSON object.`,
    });
    try {
      const parsed = schema.safeParse(extractJson(text));
      if (parsed.success) return parsed.data;
      lastError = parsed.error;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Model response could not be parsed: ${String(lastError)}`);
}
