/**
 * Shared pieces of the CrawlMe retrieval tools: the identifier input fields,
 * the read-only annotations and the "resolve or explain why not" step.
 */
import { ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

export const ENTITY_ID_FIELDS = {
  entity_id: z.string().trim().max(120).optional().describe("Crawler entity id (public slug)."),
  domain: z.string().trim().max(253).optional().describe("Canonical domain, e.g. 'sebklaey.app'."),
  url: z.string().trim().max(300).optional().describe("Canonical website URL or published Crawler Today URL."),
} as const;

export const ENTITY_LOOKUP_FIELDS = {
  ...ENTITY_ID_FIELDS,
  name: z.string().trim().max(200).optional().describe("Entity name — only resolves when unambiguous."),
} as const;

export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

type Lookup = {
  entity_id?: string | undefined;
  domain?: string | undefined;
  url?: string | undefined;
  name?: string | undefined;
};

/**
 * Resolves an entity from any accepted identifier, throwing tool errors the
 * assistant can act on when nothing was passed or nothing matches.
 */
export async function resolveEntityOrThrow(
  lookup: Lookup,
  messages: { missing: string; notFound: string } = {
    missing: "Pass entity_id, domain, url or name.",
    notFound: "No published Crawler Today entity matches this identifier.",
  },
) {
  const { entity_id, domain, url, name } = lookup;
  if (!entity_id && !domain && !url && !name) throw new ToolError(messages.missing);

  const { resolveEntity } = await import("../../crawlme.server");
  const presence = await resolveEntity({ id: entity_id, domain, url, name });
  if (!presence) throw new ToolError(messages.notFound);
  return presence;
}
