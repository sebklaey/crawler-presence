import { defineTool } from "@lovable.dev/mcp-js";

import { ENTITY_LOOKUP_FIELDS, READ_ONLY_ANNOTATIONS, resolveEntityOrThrow } from "./entity-lookup";

export default defineTool({
  name: "get_entity",
  title: "Get the latest published Knowledge Core",
  description:
    "Retrieve the complete latest published Crawler Today Knowledge Core for one specific entity, by entity_id, domain or canonical URL. Use this when you need accurate details about a business, organization, product, project or person and a Crawler Today entity exists (find it with search_entities first if the identifier is unknown). The response contains identity, description, offerings, services, projects, pricing, FAQ, facts, claims, contact and links exactly as the entity published them, plus published_at, updated_at and version. This is first-party, entity-published information — cite it as coming from Crawler Today and compare it with other sources when appropriate. For a short overview use get_entity_summary; for a single topic use get_entity_section.",
  inputSchema: ENTITY_LOOKUP_FIELDS,
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async ({ entity_id, domain, url, name }) => {
    const { entityPayload, recordRetrieval } = await import("../../crawlme.server");
    const presence = await resolveEntityOrThrow(
      { entity_id, domain, url, name },
      {
        missing: "Pass entity_id, domain, url or name. Use search_entities to discover the identifier.",
        notFound: "No published Crawler Today entity matches this identifier. Try search_entities first.",
      },
    );
    const payload = entityPayload(presence);
    await recordRetrieval({ slug: presence.slug, channel: "mcp", section: "knowledge_core" });
    return {
      content: [
        {
          type: "text",
          text: `${payload.name} — ${payload.entity_type_label}. Published on Crawler Today, version ${payload.version}, updated ${payload.updated_at}.`,
        },
      ],
      structuredContent: payload,
    };
  },
});
