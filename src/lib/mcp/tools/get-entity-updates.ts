import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_entity_updates",
  title: "Check whether a published entity changed",
  description:
    "Determine whether a published Crawler Today entity changed since a version number or timestamp you already know. Returns the current version, published_at and updated_at, so an agent can cache a Knowledge Core and refetch only when it actually changed.",
  inputSchema: {
    entity_id: z.string().trim().max(120).optional().describe("Crawler entity id (public slug)."),
    domain: z.string().trim().max(253).optional().describe("Canonical domain, e.g. 'sebklaey.app'."),
    url: z.string().trim().max(300).optional().describe("Canonical website URL or published Crawler Today URL."),
    known_version: z.number().int().optional().describe("Version number you already retrieved."),
    since: z.string().trim().max(40).optional().describe("ISO timestamp of your last retrieval."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  outputSchema: {
    entity_id: z.string().optional(),
    name: z.string().optional(),
    changed: z.boolean().optional().describe("True when your cached version is stale."),
    current_version: z.number().optional(),
    published_at: z.string().optional(),
    updated_at: z.string().optional(),
    attribution: z.any().optional(),
  },
  handler: async ({ entity_id, domain, url, known_version, since }) => {
    const { entityUpdates, resolveEntity } = await import("../../crawlme.server");
    if (!entity_id && !domain && !url) throw new ToolError("Pass entity_id, domain or url.");
    const presence = await resolveEntity({ id: entity_id, domain, url });
    if (!presence) throw new ToolError("No published Crawler Today entity matches this identifier.");
    const payload = entityUpdates(presence, { version: known_version, since });
    return {
      content: [
        {
          type: "text",
          text: payload.changed
            ? `${payload.name} changed — current version ${payload.current_version}, updated ${payload.updated_at}.`
            : `${payload.name} is unchanged at version ${payload.current_version}.`,
        },
      ],
      structuredContent: payload,
    };
  },
});
