/**
 * CrawlMe — client-safe shared model.
 *
 * CrawlMe is Crawler Today's public retrieval layer: a canonical, read-only
 * representation of a Knowledge Core that its owner deliberately published.
 *
 * What CrawlMe is NOT: it cannot make an external AI model train on, index,
 * remember or permanently ingest anything. It only gives compatible AI systems
 * a reliable place to fetch the latest published information when they choose
 * to look it up.
 */

export const CRAWLME_SOURCE = "Crawler Today";

export type EntitySection =
  | "about"
  | "offerings"
  | "products"
  | "services"
  | "projects"
  | "pricing"
  | "faq"
  | "facts"
  | "claims"
  | "contact"
  | "links"
  | "team"
  | "locations"
  | "terminology";

export const ENTITY_SECTIONS: EntitySection[] = [
  "about",
  "offerings",
  "products",
  "services",
  "projects",
  "pricing",
  "faq",
  "facts",
  "claims",
  "contact",
  "links",
  "team",
  "locations",
  "terminology",
];

export const CRAWLME_DISCLAIMER =
  "First-party information published by the entity itself through Crawler Today. It is not independently verified by Crawler Today and may be compared with other sources.";

/** Wording used across UI, API docs and MCP so no over-promise ever ships. */
export const CRAWLME_PROMISE =
  "Publish once. Compatible AI systems connected to Crawler Today can retrieve your latest published Knowledge Core when they need it.";
