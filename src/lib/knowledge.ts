export type EntityType =
  | "person"
  | "creator"
  | "studio"
  | "organization"
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

export type CatalogKind = "offering" | "project" | "service";

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

export type DocumentEntry = {
  title: string;
  text: string;
  /** Original file name or origin, as reported by the user. */
  source?: string;
  addedAt?: string;
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
  /** Text documents uploaded in ChatGPT and imported into the Knowledge Core. */
  documents: DocumentEntry[];
  gaps: string[];
  /** Extended editor sections (organization, audiences, pricing, news, archive). */
  ext?: import("./kc/model").CoreExtension;

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
  documents: [],
  gaps: [],
  updatedAt: new Date().toISOString(),
});

export const isCoreEmpty = (c: KnowledgeCore) =>
  !c.name && !c.summary && c.facts.length === 0 && c.items.length === 0 && (c.documents ?? []).length === 0;

export const entityLabel: Record<EntityType, string> = {
  person: "Person",
  creator: "Creator",
  studio: "Studio",
  organization: "Organization",
  company: "Company",
  project: "Project",
  unknown: "Not yet identified",
};

/* ------------------------------------------------------------------ */
/* Presence status                                                     */
/* ------------------------------------------------------------------ */

export type PresenceCheck = { label: string; done: boolean; weight: number };

export function presenceChecks(c: KnowledgeCore): PresenceCheck[] {
  const offerings = c.items.filter((i) => i.kind === "offering");
  const projects = c.items.filter((i) => i.kind === "project");
  const services = c.items.filter((i) => i.kind === "service");
  return [
    { label: "Identity (name + type)", done: Boolean(c.name && c.entityType !== "unknown"), weight: 15 },
    { label: "Short summary", done: c.summary.length > 60, weight: 15 },
    { label: "At least 3 verified facts", done: c.facts.filter((f) => f.status === "verified").length >= 3, weight: 20 },
    { label: "Positioning confirmed", done: c.stories.some((s) => s.confirmed), weight: 10 },
    {
      label: "Content records (offerings, projects or services)",
      done: offerings.length + projects.length + services.length > 0,
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

/** Path index only — must not build file contents (llms.txt links to these). */
function filePaths(c: KnowledgeCore): string[] {
  const has = (k: CatalogKind) => c.items.some((i) => i.kind === k);
  const paths = ["about.md"];
  if (has("offering")) paths.push("offerings.md");
  if (has("project")) paths.push("projects.md");
  if (has("service")) paths.push("services.md");
  if (c.faqs.length) paths.push("faq.md");
  if (pub(extOf(c).audiences).length) paths.push("audiences.md");
  if (pub(extOf(c).pricing).length) paths.push("pricing.md");
  if (pub(extOf(c).news).length) paths.push("news.md");
  if (c.cv.length) paths.push("cv.md");
  for (const d of docs(c)) paths.push(`docs/${slug(d.title)}.md`);
  paths.push("api/entity.json");
  for (const k of ["audiences", "pricing", "news"] as const)
    if (pub(extOf(c)[k]).length) paths.push(`api/${k}.json`);
  if (docs(c).length) paths.push("api/documents.json");
  for (const k of ["offering", "project", "service"] as CatalogKind[]) if (has(k)) paths.push(`api/${k}s.json`);
  paths.push("llms-full.txt");
  return paths;
}

function docs(c: KnowledgeCore): DocumentEntry[] {
  return (c.documents ?? []).filter((d) => d.title && d.text);
}

export function documentMd(d: DocumentEntry): string {
  return [`# ${d.title}`, "", d.source ? `_Source: ${d.source}_` : "", d.source ? "" : "", d.text.trim(), ""]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}

export function documentsJson(c: KnowledgeCore) {
  const list = docs(c);
  return {
    count: list.length,
    documents: list.map((d) => ({
      id: slug(d.title),
      title: d.title,
      source: d.source ?? null,
      added_at: d.addedAt ?? null,
      path: `docs/${slug(d.title)}.md`,
      characters: d.text.length,
    })),
  };
}

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
    ...filePaths(c).map((p) => bullet(`[${p}](/${p})`)),
  ];
  return lines.join("\n") + "\n";
}

export function buildLlmsFullTxt(c: KnowledgeCore): string {
  const parts: string[] = [buildLlmsTxt(c).trimEnd(), ""];
  for (const f of baseFiles(c)) {
    if (f.path === "llms.txt" || f.type === "json") continue;
    if (f.path === "llms-full.txt") continue;
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
    organization: organizationJson(c),
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


/* ---------------- Extended editor sections (organization, audiences, pricing, news) --------------- */

type ExtLike = NonNullable<KnowledgeCore["ext"]>;

function extOf(c: KnowledgeCore): ExtLike {
  const raw = c.ext;
  return {
    v: 1,
    organization: raw?.organization ?? {},
    audiences: raw?.audiences ?? [],
    pricing: raw?.pricing ?? [],
    news: raw?.news ?? [],
    evidence: raw?.evidence ?? {},
    archive: raw?.archive ?? [],
  };
}

/** Only records the user marked as public ever reach a generated file. */
function pub(list: ExtLike["audiences"]) {
  return (list ?? []).filter((r) => r && r.visibility === "public" && r.title);
}

function recordLines(list: ExtLike["audiences"]) {
  return pub(list).flatMap((r) => [
    `## ${r.title}`,
    "",
    r.body ?? "",
    ...(r.fields ?? []).filter((f) => f.key && f.value).map((f) => `**${f.key}:** ${f.value}`),
    "",
  ]);
}

export function buildAudiencesMd(c: KnowledgeCore) {
  return ["# Audiences", "", ...recordLines(extOf(c).audiences)].join("\n");
}

export function buildPricingMd(c: KnowledgeCore) {
  return ["# Pricing", "", ...recordLines(extOf(c).pricing)].join("\n");
}

export function buildNewsMd(c: KnowledgeCore) {
  return ["# News and updates", "", ...recordLines(extOf(c).news)].join("\n");
}

function recordsJson(c: KnowledgeCore, key: "audiences" | "pricing" | "news") {
  const list = pub(extOf(c)[key]);
  return {
    type: key,
    count: list.length,
    records: list.map((r) => ({
      id: slug(r.title),
      title: r.title,
      body: r.body ?? null,
      details: Object.fromEntries((r.fields ?? []).filter((f) => f.key).map((f) => [f.key, f.value])),
      evidence: r.status,
      source: r.source ?? null,
      updated_at: r.updatedAt,
    })),
  };
}

export function organizationJson(c: KnowledgeCore) {
  const org = extOf(c).organization;
  const entries = Object.entries(org).filter(([, v]) => (v ?? "").toString().trim());
  return entries.length ? Object.fromEntries(entries) : null;
}

/** Only relevant files are generated — a photographer gets no offerings.md. */
function baseFiles(c: KnowledgeCore): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const has = (k: CatalogKind) => c.items.some((i) => i.kind === k);

  files.push({ path: "llms.txt", type: "text", content: buildLlmsTxt(c) });
  files.push({ path: "about.md", type: "markdown", content: buildAboutMd(c) });
  if (has("offering"))
    files.push({ path: "offerings.md", type: "markdown", content: catalogMd(c, "offering", "Offerings") });
  if (has("project")) files.push({ path: "projects.md", type: "markdown", content: catalogMd(c, "project", "Projects") });
  if (has("service")) files.push({ path: "services.md", type: "markdown", content: catalogMd(c, "service", "Services") });
  if (c.faqs.length) files.push({ path: "faq.md", type: "markdown", content: buildFaqMd(c) });
  if (pub(extOf(c).audiences).length)
    files.push({ path: "audiences.md", type: "markdown", content: buildAudiencesMd(c) });
  if (pub(extOf(c).pricing).length)
    files.push({ path: "pricing.md", type: "markdown", content: buildPricingMd(c) });
  if (pub(extOf(c).news).length) files.push({ path: "news.md", type: "markdown", content: buildNewsMd(c) });
  if (c.cv.length) files.push({ path: "cv.md", type: "markdown", content: buildCvMd(c) });
  for (const d of docs(c))
    files.push({ path: `docs/${slug(d.title)}.md`, type: "markdown", content: documentMd(d) });

  files.push({ path: "api/entity.json", type: "json", content: JSON.stringify(entityJson(c), null, 2) });
  for (const k of ["audiences", "pricing", "news"] as const) {
    if (pub(extOf(c)[k]).length)
      files.push({ path: `api/${k}.json`, type: "json", content: JSON.stringify(recordsJson(c, k), null, 2) });
  }
  if (docs(c).length)
    files.push({ path: "api/documents.json", type: "json", content: JSON.stringify(documentsJson(c), null, 2) });
  for (const kind of ["offering", "project", "service"] as CatalogKind[]) {
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
