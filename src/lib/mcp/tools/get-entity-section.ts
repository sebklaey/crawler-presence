import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { ENTITY_LOOKUP_FIELDS, READ_ONLY_ANNOTATIONS, resolveEntityOrThrow } from "./entity-lookup";

export default defineTool({
  name: "get_entity_section",
  title: "Get one section of a published entity",
  description:
    "Retrieve only one relevant part of a published Crawler Today Knowledge Core — products/offerings, services, projects, pricing, faq, contact, about, team, locations, terminology, facts or claims. Use this instead of get_entity when the user's question is about a single topic, so you do not pull the whole Knowledge Core into context. First-party information published by the entity itself through Crawler Today.",
  inputSchema: {
    section: z
      .string()
      .trim()
      .max(30)
      .describe("about, offerings, products, services, projects, pricing, faq, facts, claims, contact, links, team, locations or terminology."),
    ...ENTITY_LOOKUP_FIELDS,
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async ({ section, entity_id, domain, url, name }) => {
    const { ENTITY_SECTIONS } = await import("../../crawlme");
    const { entitySection, recordRetrieval } = await import("../../crawlme.server");
    const wanted = section.toLowerCase();
    if (!ENTITY_SECTIONS.includes(wanted as never))
      throw new ToolError(`Unknown section "${section}". Available: ${ENTITY_SECTIONS.join(", ")}`);
    const presence = await resolveEntityOrThrow({ entity_id, domain, url, name });
    const payload = entitySection(presence, wanted as never);
    await recordRetrieval({ slug: presence.slug, channel: "mcp", section: wanted });
    return {
      content: [{ type: "text", text: `${payload.name} — section "${wanted}" from Crawler Today (version ${payload.freshness.version}).` }],
      structuredContent: payload,
    };
  },
});
