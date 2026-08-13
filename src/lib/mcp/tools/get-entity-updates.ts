import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { ENTITY_ID_FIELDS, READ_ONLY_ANNOTATIONS, resolveEntityOrThrow } from "./entity-lookup";

export default defineTool({
  name: "get_entity_updates",
  title: "Check whether a published entity changed",
  description:
    "Determine whether a published Crawler Today entity changed since a version number or timestamp you already know. Returns the current version, published_at and updated_at, so an agent can cache a Knowledge Core and refetch only when it actually changed.",
  inputSchema: {
    ...ENTITY_ID_FIELDS,
    known_version: z.number().int().optional().describe("Version number you already retrieved."),
    since: z.string().trim().max(40).optional().describe("ISO timestamp of your last retrieval."),
  },
  annotations: READ_ONLY_ANNOTATIONS,
  handler: async ({ entity_id, domain, url, known_version, since }) => {
    const { entityUpdates } = await import("../../crawlme.server");
    const presence = await resolveEntityOrThrow(
      { entity_id, domain, url },
      {
        missing: "Pass entity_id, domain or url.",
        notFound: "No published Crawler Today entity matches this identifier.",
      },
    );
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
