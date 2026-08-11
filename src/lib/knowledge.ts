export type EntityType =
  | "person"
  | "creator"
  | "shop"
  | "product-brand"
  | "manufacturer"
  | "company"
  | "project"
  | "unknown";

export type Fact = {
  id: string;
  label: string;
  value: string;
  /** verified = user confirmed it, claimed = AI inferred / awaiting confirmation */
  status: "verified" | "claimed";
  source?: string;
};

export type Story = {
  id: string;
  label: string;
  text: string;
  confirmed: boolean;
};

export type CatalogKind = "product" | "project" | "service";

export type CatalogItem = {
  id: string;
  kind: CatalogKind;
  name: string;
  summary: string;
  details?: string;
  url?: string;
  tags?: string[];
};

export type FaqItem = { id: string; question: string; answer: string };

export type CvEntry = {
  id: string;
  role: string;
  organization?: string;
  period?: string;
  note?: string;
};

export type KnowledgeCore = {
  entityType: EntityType;
  name: string;
  tagline: string;
  summary: string;
  location?: string;
  website?: string;
  languages?: string[];
  facts: Fact[];
  stories: Story[];
  items: CatalogItem[];
  faqs: FaqItem[];
  cv: CvEntry[];
  links: { label: string; url: string }[];
  gaps: string[];
  updatedAt: string;
};

export const emptyCore = (): KnowledgeCore => ({
  entityType: "unknown",
  name: "",
  tagline: "",
  summary: "",
  facts: [],
  stories: [],
  items: [],
  faqs: [],
  cv: [],
  links: [],
  gaps: [],
  updatedAt: new Date().toISOString(),
});

export const isCoreEmpty = (c: KnowledgeCore) =>
  !c.name && !c.summary && c.facts.length === 0 && c.items.length === 0;

export const entityLabel: Record<EntityType, string> = {
  person: "Person",
  creator: "Creator",
  shop: "Shop",
  "product-brand": "Product brand",
  manufacturer: "Manufacturer",
  company: "Company",
  project: "Project",
  unknown: "Not yet identified",
};

/* ------------------------------------------------------------------ */
/* Presence status                                                     */
/* ------------------------------------------------------------------ */

export type PresenceCheck = { label: string; done: boolean; weight: number };

export function presenceChecks(c: KnowledgeCore): PresenceCheck[] {
  const products = c.items.filter((i) => i.kind === "product");
  const projects = c.items.filter((i) => i.kind === "project");
  const services = c.items.filter((i) => i.kind === "service");
  return [
    { label: "Identity (name + type)", done: Boolean(c.name && c.entityType !== "unknown"), weight: 15 },
    { label: "Short summary", done: c.summary.length > 60, weight: 15 },
    { label: "At least 3 verified facts", done: c.facts.filter((f) => f.status === "verified").length >= 3, weight: 20 },
    { label: "Positioning confirmed", done: c.stories.some((s) => s.confirmed), weight: 10 },
    {
      label: "Catalog (products, projects or services)",
      done: products.length + projects.length + services.length > 0,
      weight: 20,
    },
    { label: "3+ FAQ answers", done: c.faqs.length >= 3, weight: 10 },
    { label: "Contact or website link", done: Boolean(c.website) || c.links.length > 0, weight: 10 },
  ];
}

export function presenceScore(c: KnowledgeCore) {
  const checks = presenceChecks(c);
  const total = checks.reduce((s, x) => s + x.weight, 0);
  const got = checks.filter((x) => x.done).reduce((s, x) => s + x.weight, 0);
  return Math.round((got / total) * 100);
}

export function presenceLabel(score: number) {
  if (score >= 85) return "Ready to publish";
  if (score >= 55) return "Almost there";
  if (score > 0) return "Draft";
  return "Empty";
}

/* ------------------------------------------------------------------ */
/* File generation                                                     */
/* ------------------------------------------------------------------ */

export type GeneratedFile = {
  path: string;
  type: "markdown" | "text" | "json";
  content: string;
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "presence";

const bullet = (s: string) => `- ${s}`;

function verified(c: KnowledgeCore) {
  return c.facts.filter((f) => f.status === "verified");
}

export function buildLlmsTxt(c: KnowledgeCore): string {
  const name = c.name || "Untitled presence";
  const lines = [
    `# ${name}`,
    "",
    c.tagline ? `> ${c.tagline}` : "> AI-readable presence generated with Crawler.",
    "",
    c.summary || "No summary yet.",
    "",
    "## Verified facts",
    ...(verified(c).length ? verified(c).map((f) => bullet(`${f.label}: ${f.value}`)) : [bullet("None confirmed yet.")]),
    "",
    "## Files",
    ...baseFiles(c)
      .filter((f) => f.path !== "llms.txt")
      .map((f) => bullet(`[${f.path}](/${f.path})`)),
  ];
  return lines.join("\n") + "\n";
}

export function buildLlmsFullTxt(c: KnowledgeCore): string {
  const parts: string[] = [buildLlmsTxt(c).trimEnd(), ""];
  for (const f of baseFiles(c)) {
    if (f.path === "llms.txt" || f.type === "json") continue;
    parts.push(`\n---\n\n# /${f.path}\n\n${f.content.trim()}`);
  }
  return parts.join("\n") + "\n";
}

export function buildAboutMd(c: KnowledgeCore): string {
  const claimed = c.facts.filter((f) => f.status === "claimed");
  return [
    `# About ${c.name || "this presence"}`,
    "",
    c.summary || "_No summary yet._",
    "",
    c.location ? `**Location:** ${c.location}` : "",
    c.website ? `**Website:** ${c.website}` : "",
    "",
    "## Verified facts",
    ...(verified(c).length ? verified(c).map((f) => bullet(`**${f.label}:** ${f.value}`)) : ["_None yet._"]),
    "",
    ...(c.stories.length
      ? [
          "## Positioning and story",
          ...c.stories.map((s) => `### ${s.label}\n\n${s.text}${s.confirmed ? "" : "\n\n_(unconfirmed draft)_"}`),
        ]
      : []),
    ...(claimed.length ? ["", "## Unconfirmed claims", ...claimed.map((f) => bullet(`${f.label}: ${f.value}`))] : []),
    "",
  ]
    .filter((l) => l !== "")
    .join("\n")
    .concat("\n");
}

function catalogMd(c: KnowledgeCore, kind: CatalogKind, title: string) {
  const items = c.items.filter((i) => i.kind === kind);
  return [
    `# ${title}`,
    "",
    ...items.flatMap((i) => [
      `## ${i.name}`,
      "",
      i.summary,
      i.details ? `\n${i.details}` : "",
      i.tags?.length ? `\n**Tags:** ${i.tags.join(", ")}` : "",
      i.url ? `\n**Link:** ${i.url}` : "",
      "",
    ]),
  ].join("\n");
}

export function buildFaqMd(c: KnowledgeCore) {
  return ["# FAQ", "", ...c.faqs.flatMap((f) => [`## ${f.question}`, "", f.answer, ""])].join("\n");
}

export function buildCvMd(c: KnowledgeCore) {
  return [
    `# CV — ${c.name}`,
    "",
    ...c.cv.map((e) =>
      bullet(
        [e.period, e.role, e.organization].filter(Boolean).join(" · ") + (e.note ? ` — ${e.note}` : ""),
      ),
    ),
    "",
  ].join("\n");
}

export function entityJson(c: KnowledgeCore) {
  return {
    name: c.name,
    type: c.entityType,
    tagline: c.tagline,
    summary: c.summary,
    location: c.location ?? null,
    website: c.website ?? null,
    languages: c.languages ?? [],
    verified_facts: verified(c).map((f) => ({ label: f.label, value: f.value, source: f.source ?? null })),
    unverified_claims: c.facts
      .filter((f) => f.status === "claimed")
      .map((f) => ({ label: f.label, value: f.value })),
    positioning: c.stories.map((s) => ({ label: s.label, text: s.text, confirmed: s.confirmed })),
    links: c.links,
    updated_at: c.updatedAt,
    generated_by: "Crawler",
  };
}

export function catalogJson(c: KnowledgeCore, kind: CatalogKind) {
  return {
    type: kind,
    count: c.items.filter((i) => i.kind === kind).length,
    items: c.items
      .filter((i) => i.kind === kind)
      .map((i) => ({
        id: slug(i.name),
        name: i.name,
        summary: i.summary,
        details: i.details ?? null,
        url: i.url ?? null,
        tags: i.tags ?? [],
      })),
  };
}

/** Only relevant files are generated — a photographer gets no products.md. */
function baseFiles(c: KnowledgeCore): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const has = (k: CatalogKind) => c.items.some((i) => i.kind === k);

  files.push({ path: "llms.txt", type: "text", content: buildLlmsTxt(c) });
  files.push({ path: "about.md", type: "markdown", content: buildAboutMd(c) });
  if (has("product")) files.push({ path: "products.md", type: "markdown", content: catalogMd(c, "product", "Products") });
  if (has("project")) files.push({ path: "projects.md", type: "markdown", content: catalogMd(c, "project", "Projects") });
  if (has("service")) files.push({ path: "services.md", type: "markdown", content: catalogMd(c, "service", "Services") });
  if (c.faqs.length) files.push({ path: "faq.md", type: "markdown", content: buildFaqMd(c) });
  if (c.cv.length) files.push({ path: "cv.md", type: "markdown", content: buildCvMd(c) });

  files.push({ path: "api/entity.json", type: "json", content: JSON.stringify(entityJson(c), null, 2) });
  for (const kind of ["product", "project", "service"] as CatalogKind[]) {
    if (has(kind))
      files.push({
        path: `api/${kind}s.json`,
        type: "json",
        content: JSON.stringify(catalogJson(c, kind), null, 2),
      });
  }
  return files;
}

export function generatedFiles(c: KnowledgeCore): GeneratedFile[] {
  return [...baseFiles(c), { path: "llms-full.txt", type: "text" as const, content: buildLlmsFullTxt(c) }];
}

export const presenceSlug = (c: KnowledgeCore) => slug(c.name);
