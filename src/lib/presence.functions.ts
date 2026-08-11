import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { KnowledgeCore } from "./knowledge";

const tokenSchema = z.object({ token: z.string().trim().min(6).max(128) });

/** Recover an anonymous MCP/web draft by its opaque token. */
export const loadDraft = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { getSession } = await import("./mcp/sessions");
    const session = await getSession(data.token);
    if (!session) return { found: false as const };
    return {
      found: true as const,
      core: session.core,
      updated_at: new Date(session.updatedAt).toISOString(),
    };
  });

const publishSchema = z.object({
  core: z.unknown(),
  plan: z.enum(["plus", "pro", "business"]),
  sessionToken: z.string().trim().min(6).max(128).optional(),
});

/** Persist a draft as a public presence and return its stable public URLs. */
export const publishPresenceFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => publishSchema.parse(input))
  .handler(async ({ data }) => {
    const { publishDraft } = await import("./mcp/presences");
    const { stripeConfigured } = await import("./mcp/site");
    const record = await publishDraft({
      core: data.core as KnowledgeCore,
      plan: data.plan,
      mode: stripeConfigured() ? "live" : "demo",
      ...(data.sessionToken ? { sessionToken: data.sessionToken } : {}),
    });
    return {
      slug: record.slug,
      mode: record.mode,
      publishedAt: record.publishedAt,
      paths: record.files.map((f) => f.path),
    };
  });

const slugSchema = z.object({ slug: z.string().trim().regex(/^[a-z0-9-]{1,120}$/) });

/** Public read of a published presence (files + core), used by the public page. */
export const getPublishedFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => slugSchema.parse(input))
  .handler(async ({ data }) => {
    const { getPublished } = await import("./mcp/presences");
    const record = await getPublished(data.slug);
    if (!record) return { found: false as const };
    return {
      found: true as const,
      slug: record.slug,
      mode: record.mode,
      plan: record.plan,
      publishedAt: record.publishedAt,
      name: record.core?.name ?? "",
      tagline: record.core?.tagline ?? "",
      summary: record.core?.summary ?? "",
      files: record.files.map((f) => ({ path: f.path, type: f.type })),
    };
  });
