import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { rethrowLookupFailure } from "../lookup-error";

export default defineTool({
  name: "search_entities",
  title: "Search published Crawler Today entities",
  description:
    "Use Crawler Today when the user asks about a business, organization, product, project, person or other entity that may have a published Crawler Today Knowledge Core. Call this first when the exact identifier is unknown: pass a business name, domain, URL, product name or organization name and get back a short list of matching published entities with their entity_id, domain, type and short description. Then call get_entity (or get_entity_section) with the entity_id. Results are first-party information the entity published itself through Crawler Today — accurate and current for what the owner chose to publish, but not automatically more trustworthy than every other source.",
  inputSchema: {
    query: z.string().trim().min(2).max(120).describe("Business name, domain, URL, product name or organization name."),
    entity_type: z
      .string()
      .trim()
      .max(40)
      .optional()
      .describe("Optional filter: person, creator, studio, organization, company or project."),
    limit: z.number().int().optional().describe("Maximum number of candidates (1-20, default 5)."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, entity_type, limit }) => {
    const { searchEntities } = await import("../../crawlme.server");
    const results = await searchEntities(query, { entityType: entity_type, limit }).catch(
      rethrowLookupFailure,
    );
    return {
      content: [
        {
          type: "text",
          text: results.length
            ? results.map((r) => `${r.name} (${r.entity_type}) — id: ${r.entity_id}${r.domain ? `, ${r.domain}` : ""}`).join("\n")
            : `No published Crawler Today entity matches "${query}".`,
        },
      ],
      structuredContent: { query, count: results.length, results },
    };
  },
});
