import { emptyCore, type CatalogItem, type Fact, type KnowledgeCore } from "../knowledge";

export const fact = (label: string, value: string, status: Fact["status"] = "verified"): Fact => ({
  id: `fact-${label.toLowerCase().replace(/\s+/g, "-")}`,
  label,
  value,
  status,
});

export const item = (
  kind: CatalogItem["kind"],
  name: string,
  extra: Partial<CatalogItem> = {},
): CatalogItem => ({
  id: `item-${name.toLowerCase().replace(/\s+/g, "-")}`,
  kind,
  name,
  summary: `${name} summary`,
  ...extra,
});

/** Drops the optional website, which `exactOptionalPropertyTypes` forbids overriding with undefined. */
export const withoutWebsite = (core: KnowledgeCore): KnowledgeCore => {
  const { website, ...rest } = core;
  return rest;
};

/** A Knowledge Core that satisfies every presence check. */
export const completeCore = (overrides: Partial<KnowledgeCore> = {}): KnowledgeCore => ({
  ...emptyCore(),
  entityType: "company",
  name: "Aurora Studio",
  tagline: "Design partner for small teams",
  summary:
    "Aurora Studio designs brand identities and digital products for small teams that need a clear, verifiable presence.",
  location: "Zurich",
  website: "https://aurora.example",
  languages: ["en", "de"],
  facts: [
    fact("Founded", "2019"),
    fact("Team", "5 people"),
    fact("Languages", "German and English"),
  ],
  stories: [{ id: "s1", label: "Positioning", text: "Small, senior team.", confirmed: true }],
  items: [
    item("offering", "Brand identity"),
    item("project", "Museum site"),
    item("service", "Consulting"),
  ],
  faqs: [
    { id: "q1", question: "How do we start?", answer: "With a kick-off workshop." },
    { id: "q2", question: "What does it cost?", answer: "From 5000 CHF." },
    { id: "q3", question: "Remote?", answer: "Yes." },
  ],
  cv: [{ id: "c1", role: "Founder", organization: "Aurora", period: "2019–", note: "Design lead" }],
  links: [{ label: "Contact", url: "https://aurora.example/contact" }],
  gaps: [],
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});
