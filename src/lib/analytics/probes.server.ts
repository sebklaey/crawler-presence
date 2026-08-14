/**
 * Controlled AI visibility tests ("probes").
 *
 * These are synthetic samples: Crawler sends the same versioned prompts to
 * selected AI APIs on a schedule and records whether the entity was
 * mentioned, cited or recommended. A probe result is never presented as real
 * user behaviour and never mixed into observed events.
 */
import { wilsonInterval, type ProviderId } from "./model";

type RuntimeGlobals = typeof globalThis & { process?: { env?: Record<string, string | undefined> } };

function env(name: string): string | undefined {
  return (globalThis as RuntimeGlobals).process?.env?.[name]?.trim() || undefined;
}

async function client() {
  try {
    const { db } = await import("../mcp/db.server");
    return db();
  } catch {
    return null;
  }
}

export type ProbeDefinition = {
  id: string;
  prompt_id: string;
  prompt: string;
  prompt_version: string;
  category: string;
  locale: string;
  region: string;
  branded: boolean;
  recommendation_test: boolean;
  competitor_group: string[];
};

/** Default prompt set generated per Presence: branded, category and comparison. */
export function defaultPrompts(name: string, category: string): Omit<ProbeDefinition, "id">[] {
  const safeName = name.trim() || "this entity";
  const safeCategory = category.trim() || "this category";
  return [
    {
      prompt_id: "branded_who",
      prompt: `Who is ${safeName}? Answer factually and cite your sources.`,
      prompt_version: "v1",
      category: "branded",
      locale: "en",
      region: "global",
      branded: true,
      recommendation_test: false,
      competitor_group: [],
    },
    {
      prompt_id: "category_best",
      prompt: `Which providers are recommended for ${safeCategory}? List them with sources.`,
      prompt_version: "v1",
      category: "category",
      locale: "en",
      region: "global",
      branded: false,
      recommendation_test: true,
      competitor_group: [],
    },
    {
      prompt_id: "comparison",
      prompt: `Compare the leading options for ${safeCategory} and say which you would recommend and why.`,
      prompt_version: "v1",
      category: "comparison",
      locale: "en",
      region: "global",
      branded: false,
      recommendation_test: true,
      competitor_group: [],
    },
  ];
}

export async function ensureProbeDefinitions(slug: string, name: string, category: string): Promise<ProbeDefinition[]> {
  const supabase = await client();
  if (!supabase) return [];
  const { data: existing } = await supabase
    .from("probe_definitions")
    .select("id, prompt_id, prompt, prompt_version, category, locale, region, branded, recommendation_test, competitor_group")
    .eq("presence_slug", slug)
    .eq("active", true);
  if (existing?.length) return existing as ProbeDefinition[];

  const rows = defaultPrompts(name, category).map((p) => ({ presence_slug: slug, ...p }));
  const { data, error } = await supabase
    .from("probe_definitions")
    .upsert(rows, { onConflict: "presence_slug,prompt_id,prompt_version" })
    .select("id, prompt_id, prompt, prompt_version, category, locale, region, branded, recommendation_test, competitor_group");
  if (error) {
    console.error("[crawler] probe definitions failed", error.message);
    return [];
  }
  return (data ?? []) as ProbeDefinition[];
}

/* ------------------------------------------------------------------ */
/* Provider calls                                                      */
/* ------------------------------------------------------------------ */

type ProbeAnswer = { text: string; model: string; urls: string[] };

const MODELS: Record<Exclude<ProviderId, "crawler" | "other">, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  google: "gemini-2.0-flash",
  perplexity: "sonar",
  microsoft: "gpt-4o-mini",
};

/** True when Crawler can run tests without the user supplying any key. */
export function gatewayAvailable(): boolean {
  return Boolean(env("LOVABLE_API_KEY"));
}

export function configuredProviders(): ProviderId[] {
  const out: ProviderId[] = [];
  if (env("OPENAI_API_KEY")) out.push("openai");
  if (env("ANTHROPIC_API_KEY")) out.push("anthropic");
  if (env("GEMINI_API_KEY") || gatewayAvailable()) out.push("google");
  if (env("PERPLEXITY_API_KEY")) out.push("perplexity");
  return out;
}

const GATEWAY_MODEL = "google/gemini-3.6-flash";

/** Built-in test model. No user key, no setup: this is the one-click path. */
async function askGateway(prompt: string): Promise<ProbeAnswer> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: {
      "Lovable-API-Key": env("LOVABLE_API_KEY")!,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: GATEWAY_MODEL, messages: [{ role: "user", content: prompt }] }),
  });
  if (!response.ok) throw new Error(`AI gateway [${response.status}]: ${(await response.text()).slice(0, 200)}`);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  return { text, model: GATEWAY_MODEL, urls: extractUrls(text) };
}

function extractUrls(text: string): string[] {
  return [...new Set(text.match(/https?:\/\/[^\s)"'\]]+/g) ?? [])].slice(0, 20);
}

async function askProvider(provider: ProviderId, prompt: string): Promise<ProbeAnswer> {
  const model = MODELS[provider as keyof typeof MODELS] ?? "gpt-4o-mini";
  const timeout = AbortSignal.timeout(30_000);

  if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: timeout,
      headers: {
        "x-api-key": env("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
    });
    if (!response.ok) throw new Error(`Anthropic [${response.status}]: ${(await response.text()).slice(0, 200)}`);
    const body = (await response.json()) as { content?: { text?: string }[] };
    const text = (body.content ?? []).map((c) => c.text ?? "").join("\n");
    return { text, model, urls: extractUrls(text) };
  }

  if (provider === "google" && !env("GEMINI_API_KEY") && gatewayAvailable()) {
    return askGateway(prompt);
  }

  if (provider === "google") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env("GEMINI_API_KEY")}`,
      {
        method: "POST",
        signal: timeout,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    if (!response.ok) throw new Error(`Gemini [${response.status}]: ${(await response.text()).slice(0, 200)}`);
    const body = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("\n");
    return { text, model, urls: extractUrls(text) };
  }

  const endpoint =
    provider === "perplexity" ? "https://api.perplexity.ai/chat/completions" : "https://api.openai.com/v1/chat/completions";
  const key = provider === "perplexity" ? env("PERPLEXITY_API_KEY") : env("OPENAI_API_KEY");
  const response = await fetch(endpoint, {
    method: "POST",
    signal: timeout,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });
  if (!response.ok) throw new Error(`${provider} [${response.status}]: ${(await response.text()).slice(0, 200)}`);
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    citations?: string[];
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  return { text, model, urls: [...new Set([...(body.citations ?? []), ...extractUrls(text)])].slice(0, 20) };
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

const RECOMMEND = /\b(recommend|recommended|best choice|top pick|i would suggest|worth using)\b/i;

export function scoreAnswer(
  answer: string,
  aliases: string[],
  ownDomains: string[],
  urls: string[],
  competitors: string[],
): { mentioned: boolean; recommended: boolean; ownDomainCited: boolean; competitorsMentioned: string[] } {
  const haystack = answer.toLowerCase();
  const mentioned = aliases.some((alias) => alias.trim().length > 2 && haystack.includes(alias.toLowerCase()));
  const ownDomainCited = urls.some((url) => ownDomains.some((domain) => url.toLowerCase().includes(domain.toLowerCase())));
  const competitorsMentioned = competitors.filter((c) => c.trim().length > 2 && haystack.includes(c.toLowerCase()));
  // A recommendation only counts when the entity is named in the same answer.
  const recommended = mentioned && RECOMMEND.test(answer);
  return { mentioned, recommended, ownDomainCited, competitorsMentioned };
}

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

export type ProbeRunSummary = { attempted: number; succeeded: number; failed: number; message: string };

export async function runProbes(options: {
  slug: string;
  name: string;
  category: string;
  aliases: string[];
  ownDomains: string[];
  providers?: ProviderId[];
}): Promise<ProbeRunSummary> {
  const supabase = await client();
  const providers = options.providers?.length ? options.providers : configuredProviders();
  if (!supabase) return { attempted: 0, succeeded: 0, failed: 0, message: "Storage unavailable." };
  if (!providers.length) {
    return { attempted: 0, succeeded: 0, failed: 0, message: "No test model is available right now." };
  }

  const definitions = await ensureProbeDefinitions(options.slug, options.name, options.category);
  const day = new Date().toISOString().slice(0, 10);
  let succeeded = 0;
  let failed = 0;
  let attempted = 0;

  for (const definition of definitions) {
    for (const provider of providers) {
      attempted += 1;
      const idempotencyKey = `${options.slug}:${definition.prompt_id}:${definition.prompt_version}:${provider}:${day}`;
      const base = {
        presence_slug: options.slug,
        definition_id: definition.id,
        provider,
        model: MODELS[provider as keyof typeof MODELS] ?? "unknown",
        prompt_id: definition.prompt_id,
        prompt_version: definition.prompt_version,
        locale: definition.locale,
        region: definition.region,
        evidence_type: "synthetic",
        idempotency_key: idempotencyKey,
        tested_at: new Date().toISOString(),
      };

      try {
        const answer = await askProvider(provider, definition.prompt);
        const score = scoreAnswer(
          answer.text,
          [options.name, ...options.aliases],
          options.ownDomains,
          answer.urls,
          definition.competitor_group,
        );
        const { data, error } = await supabase
          .from("probe_runs")
          .insert({
            ...base,
            model_version: answer.model,
            response_status: "ok",
            mentioned: score.mentioned,
            recommended: definition.recommendation_test ? score.recommended : null,
            own_domain_cited: score.ownDomainCited,
            competitors_mentioned: score.competitorsMentioned,
            result_summary: answer.text.slice(0, 500),
          })
          .select("id")
          .single();

        if (error) {
          if (error.code === "23505") continue; // already tested today
          throw new Error(error.message);
        }
        succeeded += 1;

        if (data?.id && answer.urls.length) {
          await supabase.from("probe_citations").insert(
            answer.urls.map((url, index) => {
              let domain: string | null = null;
              try {
                domain = new URL(url).hostname.replace(/^www\./, "");
              } catch {
                domain = null;
              }
              return {
                run_id: data.id,
                presence_slug: options.slug,
                url: url.slice(0, 500),
                domain,
                rank: index + 1,
                own_domain: Boolean(domain && options.ownDomains.some((d) => domain!.includes(d))),
              };
            }),
          );
        }
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message.slice(0, 300) : "unknown error";
        await supabase.from("probe_runs").insert({
          ...base,
          response_status: "error",
          error: message,
        });
      }
    }
  }

  return {
    attempted,
    succeeded,
    failed,
    message: `Ran ${attempted} controlled tests: ${succeeded} succeeded, ${failed} failed.`,
  };
}

export type ProbeRates = {
  n: number;
  mentionRate: number | null;
  citationRate: number | null;
  recommendationRate: number | null;
  ci: { low: number; high: number } | null;
};

/** Aggregates probe runs into rates with 95 % Wilson confidence intervals. */
export function probeRates(
  runs: { mentioned: boolean | null; own_domain_cited: boolean | null; recommended: boolean | null }[],
): ProbeRates {
  const valid = runs.filter((r) => r.mentioned !== null);
  const n = valid.length;
  if (!n) return { n: 0, mentionRate: null, citationRate: null, recommendationRate: null, ci: null };
  const mentions = valid.filter((r) => r.mentioned).length;
  const cited = valid.filter((r) => r.own_domain_cited).length;
  const recommendable = valid.filter((r) => r.recommended !== null);
  return {
    n,
    mentionRate: mentions / n,
    citationRate: cited / n,
    recommendationRate: recommendable.length
      ? recommendable.filter((r) => r.recommended).length / recommendable.length
      : null,
    ci: wilsonInterval(mentions, n),
  };
}
