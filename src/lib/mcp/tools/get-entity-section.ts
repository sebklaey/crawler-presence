import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { rethrowLookupFailure } from "../lookup-error";

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
    entity_id: z.string().trim().max(120).optional().describe("Crawler entity id (public slug)."),
    domain: z.string().trim().max(253).optional().describe("Canonical domain, e.g. 'sebklaey.app'."),
    url: z.string().trim().max(300).optional().describe("Canonical website URL or published Crawler Today URL."),
    name: z.string().trim().max(200).optional().describe("Entity name — only resolves when unambiguous."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ section, entity_id, domain, url, name }) => {
    const { ENTITY_SECTIONS } = await import("../../crawlme");
    const { entitySection, recordRetrieval, resolveEntity } = await import("../../crawlme.server");
    const wanted = section.toLowerCase();
    if (!ENTITY_SECTIONS.includes(wanted as never))
      throw new ToolError(`Unknown section "${section}". Available: ${ENTITY_SECTIONS.join(", ")}`);
    if (!entity_id && !domain && !url && !name) throw new ToolError("Pass entity_id, domain, url or name.");
    const presence = await resolveEntity({ id: entity_id, domain, url, name }).catch(
      rethrowLookupFailure,
    );
    if (!presence) throw new ToolError("No published Crawler Today entity matches this identifier.");
    const payload = entitySection(presence, wanted as never);
    await recordRetrieval({ slug: presence.slug, channel: "mcp", section: wanted });
    return {
      content: [{ type: "text", text: `${payload.name} — section "${wanted}" from Crawler Today (version ${payload.freshness.version}).` }],
      structuredContent: payload,
    };
  },
});
