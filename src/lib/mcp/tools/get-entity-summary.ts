import { defineTool } from "@lovable.dev/mcp-js";

import { ENTITY_LOOKUP_FIELDS, READ_ONLY_ANNOTATIONS, resolveEntityOrThrow } from "./entity-lookup";

export default defineTool({
  name: "get_entity_summary",
  title: "Get a short published entity overview",
  description:
    "Token-efficient overview of a published Crawler Today entity: name, type, tagline, short description, website, languages, location, how much detail exists and which sections are available. Use this when the user only needs a quick, accurate answer about who or what an entity is, or before deciding which section to fetch with get_entity_section. First-party information published by the entity itself.",
  inputSchema: ENTITY_LOOKUP_FIELDS,
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async ({ entity_id, domain, url, name }) => {
    const { entitySummary, recordRetrieval } = await import("../../crawlme.server");
    const presence = await resolveEntityOrThrow({ entity_id, domain, url, name });
    const summary = entitySummary(presence);
    await recordRetrieval({ slug: presence.slug, channel: "mcp", section: "summary" });
    return {
      content: [{ type: "text", text: `${summary.name} — ${summary.short_description || summary.entity_type_label}` }],
      structuredContent: summary,
    };
  },
});
