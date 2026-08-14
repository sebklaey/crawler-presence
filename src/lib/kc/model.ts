/**
 * Knowledge Core Editor — data model.
 *
 * Client-safe: pure types and pure functions only. The editor extends the
 * existing Knowledge Core with additional structured sections (organization,
 * audiences, pricing, news) without breaking the published file generation.
 *
 * Accountless rules apply: everything lives in the browser workspace and in the
 * published Presence. No account, no login, no profile.
 */

import type { KnowledgeCore } from "../knowledge";

/* ------------------------------------------------------------------ */
/* Evidence + visibility                                               */
/* ------------------------------------------------------------------ */

export const EVIDENCE_STATUSES = [
  "verified_fact",
  "provider_statement",
  "marketing_claim",
  "opinion",
  "estimate",
  "forecast",
  "conflicting",
  "outdated",
  "unchecked",
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const evidenceLabel: Record<EvidenceStatus, string> = {
  verified_fact: "Verified fact",
  provider_statement: "Provider statement",
  marketing_claim: "Marketing claim",
  opinion: "Opinion",
  estimate: "Estimate",
  forecast: "Forecast",
  conflicting: "Conflicting",
  outdated: "Outdated",
  unchecked: "Unchecked",
};

export const VISIBILITIES = ["public", "internal", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const visibilityLabel: Record<Visibility, string> = {
  public: "Public (published)",
  internal: "Internal (kept, not published)",
  private: "Private (never leaves this workspace)",
};

/* ------------------------------------------------------------------ */
/* Extension sections                                                  */
/* ------------------------------------------------------------------ */

export type ExtRecord = {
  id: string;
  title: string;
  body?: string;
  /** Free-form structured details, e.g. price, unit, date, region. */
  fields?: { key: string; value: string }[];
  status: EvidenceStatus;
  visibility: Visibility;
  source?: string;
  updatedAt: string;
};

export type Organization = {
  legalName?: string;
  founded?: string;
  size?: string;
  headquarters?: string;
  registration?: string;
  contactEmail?: string;
  regions?: string;
};

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type ArchivedEntry = {
  id: string;
  section: SectionKey;
  archivedAt: string;
  label: string;
  /** The original record, so it can be restored unchanged. */
  record: { [key: string]: Json };
};

export type CoreExtension = {
  v: 1;
  organization: Organization;
  audiences: ExtRecord[];
  pricing: ExtRecord[];
  news: ExtRecord[];
  /** Evidence metadata for base facts, keyed by fact id. */
  evidence: Record<string, { status: EvidenceStatus; visibility: Visibility; source?: string }>;
  archive: ArchivedEntry[];
};

export const emptyExtension = (): CoreExtension => ({
  v: 1,
  organization: {},
  audiences: [],
  pricing: [],
  news: [],
  evidence: {},
  archive: [],
});

export type CoreWithExt = KnowledgeCore & { ext?: CoreExtension };

export function getExt(core: KnowledgeCore): CoreExtension {
  const raw = (core as CoreWithExt).ext;
  if (!raw || typeof raw !== "object") return emptyExtension();
  return {
    ...emptyExtension(),
    ...raw,
    organization: raw.organization ?? {},
    audiences: raw.audiences ?? [],
    pricing: raw.pricing ?? [],
    news: raw.news ?? [],
    evidence: raw.evidence ?? {},
    archive: raw.archive ?? [],
  };
}

export function withExt(core: KnowledgeCore, ext: CoreExtension): KnowledgeCore {
  return { ...core, ext, updatedAt: new Date().toISOString() } as KnowledgeCore;
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

export const SECTION_KEYS = [
  "identity",
  "organization",
  "facts",
  "stories",
  "offerings",
  "projects",
  "services",
  "audiences",
  "faqs",
  "pricing",
  "news",
  "cv",
  "links",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const sectionLabel: Record<SectionKey, string> = {
  identity: "Identity",
  organization: "Organization",
  facts: "Facts",
  stories: "Positioning",
  offerings: "Offerings",
  projects: "Projects",
  services: "Services",
  audiences: "Audiences",
  faqs: "FAQ",
  pricing: "Pricing",
  news: "News & updates",
  cv: "CV",
  links: "Links",
};

export const IDENTITY_FIELDS = [
  "name",
  "tagline",
  "summary",
  "location",
  "website",
  "languages",
] as const;

export const ORGANIZATION_FIELDS: { key: keyof Organization; label: string }[] = [
  { key: "legalName", label: "Legal name" },
  { key: "founded", label: "Founded" },
  { key: "size", label: "Team size" },
  { key: "headquarters", label: "Headquarters" },
  { key: "regions", label: "Regions served" },
  { key: "registration", label: "Registration / ID" },
  { key: "contactEmail", label: "Contact e-mail" },
];

/* ------------------------------------------------------------------ */
/* Proposals                                                           */
/* ------------------------------------------------------------------ */

export type ProposalAction = "add" | "update" | "archive" | "restore" | "delete";

export type Proposal = {
  id: string;
  createdAt: string;
  action: ProposalAction;
  section: SectionKey;
  /** Identity/organization field key, or the record id for list sections. */
  target?: string;
  label: string;
  currentValue: string;
  proposedValue: string;
  reason: string;
  status: EvidenceStatus;
  visibility: Visibility;
  confidence: "low" | "medium" | "high";
  source?: string;
  warnings: string[];
  state: "pending" | "accepted" | "rejected";
  decidedAt?: string;
};

export type Version = {
  id: string;
  at: string;
  label: string;
  core: KnowledgeCore;
};

/* ------------------------------------------------------------------ */
/* Completeness                                                        */
/* ------------------------------------------------------------------ */

export type CompletenessRow = { section: SectionKey; label: string; count: number; done: boolean; hint: string };

export function completeness(core: KnowledgeCore): CompletenessRow[] {
  const ext = getExt(core);
  const items = (kind: string) => core.items.filter((i) => i.kind === kind).length;
  const org = Object.values(ext.organization).filter((v) => (v ?? "").toString().trim()).length;
  return [
    {
      section: "identity",
      label: sectionLabel.identity,
      count: [core.name, core.tagline, core.summary].filter(Boolean).length,
      done: Boolean(core.name && core.summary.length > 60),
      hint: "Name, tagline and a summary longer than 60 characters.",
    },
    { section: "organization", label: sectionLabel.organization, count: org, done: org >= 3, hint: "At least three organizational details." },
    {
      section: "facts",
      label: sectionLabel.facts,
      count: core.facts.length,
      done: core.facts.filter((f) => f.status === "verified").length >= 3,
      hint: "Three or more confirmed facts.",
    },
    { section: "stories", label: sectionLabel.stories, count: core.stories.length, done: core.stories.some((s) => s.confirmed), hint: "One confirmed positioning statement." },
    { section: "offerings", label: sectionLabel.offerings, count: items("offering"), done: items("offering") > 0, hint: "Describe what you offer." },
    { section: "projects", label: sectionLabel.projects, count: items("project"), done: items("project") > 0, hint: "Reference projects give context." },
    { section: "services", label: sectionLabel.services, count: items("service"), done: items("service") > 0, hint: "Services AI systems can name." },
    { section: "audiences", label: sectionLabel.audiences, count: ext.audiences.length, done: ext.audiences.length > 0, hint: "Who is this for?" },
    { section: "faqs", label: sectionLabel.faqs, count: core.faqs.length, done: core.faqs.length >= 3, hint: "Three or more answered questions." },
    { section: "pricing", label: sectionLabel.pricing, count: ext.pricing.length, done: ext.pricing.length > 0, hint: "Pricing statements assistants can quote." },
    { section: "news", label: sectionLabel.news, count: ext.news.length, done: ext.news.length > 0, hint: "Recent developments keep the Presence fresh." },
    { section: "cv", label: sectionLabel.cv, count: core.cv.length, done: core.cv.length > 0, hint: "Only relevant for people and creators." },
    { section: "links", label: sectionLabel.links, count: core.links.length, done: core.links.length > 0 || Boolean(core.website), hint: "At least one contact or profile link." },
  ];
}

export function completenessScore(core: KnowledgeCore) {
  const rows = completeness(core);
  return Math.round((rows.filter((r) => r.done).length / rows.length) * 100);
}

/** Records whose evidence status makes them look stale or unconfirmed. */
export function attentionCount(core: KnowledgeCore) {
  const ext = getExt(core);
  const flagged = Object.values(ext.evidence).filter((e) =>
    ["outdated", "conflicting", "unchecked"].includes(e.status),
  ).length;
  const unconfirmed = core.facts.filter((f) => f.status === "claimed").length;
  const drafts = core.stories.filter((s) => !s.confirmed).length;
  return flagged + unconfirmed + drafts;
}

export const kcId = () => Math.random().toString(36).slice(2, 10);
