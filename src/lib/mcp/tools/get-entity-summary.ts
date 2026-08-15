import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_entity_summary",
  title: "Get a short published entity overview",
  description:
    "Token-efficient overview of a published Crawler Today entity: name, type, tagline, short description, website, languages, location, how much detail exists and which sections are available. Use this when the user only needs a quick, accurate answer about who or what an entity is, or before deciding which section to fetch with get_entity_section. First-party information published by the entity itself.",
  inputSchema: {
    entity_id: z.string().trim().max(120).optional().describe("Crawler entity id (public slug)."),
    domain: z.string().trim().max(253).optional().describe("Canonical domain, e.g. 'sebklaey.app'."),
    url: z.string().trim().max(300).optional().describe("Canonical website URL or published Crawler Today URL."),
    name: z.string().trim().max(200).optional().describe("Entity name — only resolves when unambiguous."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  outputSchema: {
    entity_id: z.string().optional(),
    entity_type: z.string().optional(),
    entity_type_label: z.string().optional(),
    name: z.string().optional(),
    tagline: z.string().nullable().optional(),
    short_description: z.string().optional(),
    website: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    languages: z.array(z.string()).optional(),
    location: z.string().nullable().optional(),
    attribution: z.any().optional().describe("First-party attribution to Crawler Today."),
    counts: z
      .object({
        facts: z.number().optional(),
        verified_facts: z.number().optional(),
        offerings: z.number().optional(),
        services: z.number().optional(),
        projects: z.number().optional(),
        faqs: z.number().optional(),
      })
      .optional(),
    available_sections: z.array(z.string()).optional().describe("Sections you can fetch with get_entity_section."),
    freshness: z.any().optional().describe("version, published_at, updated_at."),
  },
  handler: async ({ entity_id, domain, url, name }) => {
    const { entitySummary, recordRetrieval, resolveEntity } = await import("../../crawlme.server");
    if (!entity_id && !domain && !url && !name) throw new ToolError("Pass entity_id, domain, url or name.");
    const presence = await resolveEntity({ id: entity_id, domain, url, name });
    if (!presence) throw new ToolError("No published Crawler Today entity matches this identifier.");
    const summary = entitySummary(presence);
    await recordRetrieval({ slug: presence.slug, channel: "mcp", section: "summary" });
    return {
      content: [{ type: "text", text: `${summary.name} — ${summary.short_description || summary.entity_type_label}` }],
      structuredContent: summary,
    };
  },
});
