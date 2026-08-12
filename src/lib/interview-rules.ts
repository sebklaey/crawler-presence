/**
 * Deterministische Interview-Regeln — ohne eigenes AI-Modell.
 *
 * Crawler betreibt kein eigenes Sprachmodell mehr. Die adaptive Formulierung
 * übernimmt das aufrufende Modell (ChatGPT über MCP). Diese Datei liefert die
 * regelbasierte Grundlage: Lückenanalyse, Fragenauswahl, Zusammenführung von
 * Antworten und Qualitätsbewertung. Alles ist reproduzierbar, offline und
 * erfindet niemals Fakten.
 */

export type LooseFact = { label: string; value: string; status: "verified" | "claimed"; source?: string };
export type LooseItem = { kind: "offering" | "project" | "service"; name: string; summary: string; details?: string; url?: string; tags?: string[] };

export type LooseCore = {
  entityType: "person" | "creator" | "studio" | "company" | "organization" | "project" | "unknown";
  name: string;
  tagline: string;
  summary: string;
  location?: string;
  website?: string;
  languages?: string[];
  facts: LooseFact[];
  stories: { label: string; text: string; confirmed: boolean }[];
  items: LooseItem[];
  faqs: { question: string; answer: string }[];
  cv: { role: string; organization?: string; period?: string; note?: string }[];
  links: { label: string; url: string }[];
  gaps: string[];
};

export const INTERVIEWER_INSTRUCTIONS = `Du (das aufrufende Modell) führst das Interview. Crawler selbst betreibt kein eigenes Sprachmodell: es speichert, strukturiert und veröffentlicht nur.

Regeln:
- Kein fester Fragebogen. Leite den Entity-Typ aus dem ab, was die Person schreibt (inklusive eingefügter Website- oder Produktlinks), und stelle genau EINE domänenspezifische Folgefrage, die die größte offene Lücke schließt (siehe open_gaps und next_gap).
- Fotograf:in, Designstudio, SaaS-Unternehmen und Open-Source-Projekt bekommen sehr unterschiedliche Fragen.
- Frage niemals nach Versand, Lieferung, Retouren physischer Ware, Lagerbestand oder Logistik. Crawler beschreibt ausschließlich digitale Angebote und Dienstleistungen.
- Trenne harte Fakten von Storytelling: klar Gesagtes ist ein Fakt mit status "verified", Interpretation oder Positionierung ist "claimed" bzw. eine unbestätigte Story.
- Erfinde niemals Angebote, Zahlen, Preise, Auszeichnungen oder Kund:innen. Unbekanntes gehört in "gaps".
- Schicke die extrahierten Informationen strukturiert als core_update an continue_interview. Crawler führt sie deterministisch mit dem bestehenden Knowledge Core zusammen und gibt die nächste offene Lücke zurück.`;

const EMPTY: LooseCore = {
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
};

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function normalizeCore(raw: unknown): LooseCore {
  const r = (raw ?? {}) as Record<string, unknown>;
  const entityType = str(r.entityType) as LooseCore["entityType"];
  return {
    ...EMPTY,
    entityType: (["person", "creator", "studio", "company", "organization", "project"].includes(entityType)
      ? entityType
      : "unknown") as LooseCore["entityType"],
    name: str(r.name),
    tagline: str(r.tagline),
    summary: str(r.summary),
    ...(str(r.location) ? { location: str(r.location) } : {}),
    ...(str(r.website) ? { website: str(r.website) } : {}),
    ...(arr<string>(r.languages).length ? { languages: arr<string>(r.languages) } : {}),
    facts: arr<LooseFact>(r.facts).filter((f) => f && str(f.label) && str(f.value)),
    stories: arr<LooseCore["stories"][number]>(r.stories).filter((s) => s && str(s.text)),
    items: arr<LooseItem>(r.items).filter((i) => i && str(i.name)),
    faqs: arr<LooseCore["faqs"][number]>(r.faqs).filter((f) => f && str(f.question)),
    cv: arr<LooseCore["cv"][number]>(r.cv).filter((c) => c && str(c.role)),
    links: arr<LooseCore["links"][number]>(r.links).filter((l) => l && str(l.url)),
    gaps: arr<string>(r.gaps).filter(Boolean),
  };
}

/* ------------------------------ Entity-Typ ------------------------------ */

const TYPE_HINTS: { type: LooseCore["entityType"]; words: string[] }[] = [
  { type: "creator", words: ["fotograf", "photograph", "creator", "künstler", "artist", "musiker", "autor", "writer", "illustrator", "filmmaker"] },
  { type: "studio", words: ["studio", "agentur", "agency", "atelier", "designbüro", "büro"] },
  { type: "company", words: ["gmbh", "ag ", "inc", "ltd", "saas", "unternehmen", "company", "startup", "shop", "store", "brand", "marke", "manufaktur", "hersteller"] },
  { type: "organization", words: ["verein", "stiftung", "ngo", "organisation", "organization", "association"] },
  { type: "project", words: ["projekt", "project", "open source", "open-source", "initiative", "app ", "tool"] },
  { type: "person", words: ["ich bin", "i am", "freelance", "freiberuflich", "berater", "consultant", "coach", "developer", "entwickler"] },
];

export function detectEntityType(text: string, current: LooseCore["entityType"]): LooseCore["entityType"] {
  if (current !== "unknown") return current;
  const t = text.toLowerCase();
  for (const hint of TYPE_HINTS) if (hint.words.some((w) => t.includes(w))) return hint.type;
  return "unknown";
}

export function extractUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s<>"')]+/i);
  if (match) return match[0];
  const bare = text.match(/\b[a-z0-9][a-z0-9-]*\.[a-z]{2,}(?:\/[^\s]*)?\b/i);
  return bare ? `https://${bare[0]}` : undefined;
}

/* ------------------------------- Lücken --------------------------------- */

export type GapKey =
  | "name"
  | "entity_type"
  | "summary"
  | "offerings"
  | "facts"
  | "audience"
  | "faq"
  | "contact"
  | "none";

type GapDef = { key: GapKey; label: string; question: string; suggestions: string[] };

function domainQuestion(type: LooseCore["entityType"], key: "offerings" | "facts" | "audience"): GapDef {
  const byType: Record<string, Record<string, GapDef>> = {
    creator: {
      offerings: {
        key: "offerings",
        label: "Angebote",
        question: "Welche Arbeiten oder Leistungen bietest du an — und in welchen Genres oder Formaten?",
        suggestions: ["Porträt- und Editorial-Shootings", "Lizenzierung bestehender Bildserien", "Workshops"],
      },
      facts: {
        key: "facts",
        label: "Nachprüfbare Fakten",
        question: "Welche überprüfbaren Eckdaten gehören dazu — seit wann arbeitest du, wo, und wie läuft Lizenzierung oder Nutzung?",
        suggestions: ["Seit 2016 tätig", "Arbeitssprachen Deutsch und Englisch", "Lizenzmodell pro Nutzung"],
      },
      audience: {
        key: "audience",
        label: "Zielgruppe",
        question: "Für wen arbeitest du typischerweise — welche Auftraggeber oder Projekte passen am besten?",
        suggestions: ["Magazine", "Marken", "Kulturinstitutionen"],
      },
    },
    studio: {
      offerings: {
        key: "offerings",
        label: "Angebote",
        question: "Welche Disziplinen und Leistungspakete bietet das Studio an?",
        suggestions: ["Markenidentität", "Digitalprodukte", "Beratung"],
      },
      facts: {
        key: "facts",
        label: "Nachprüfbare Fakten",
        question: "Welche belegbaren Eckdaten gibt es — Gründungsjahr, Teamgröße, Standort, Arbeitsmodell?",
        suggestions: ["Gegründet 2019", "5 Personen", "Remote plus Standort Zürich"],
      },
      audience: {
        key: "audience",
        label: "Zielgruppe",
        question: "Mit welchen Kund:innen arbeitet ihr am besten, und wie beginnt eine Zusammenarbeit?",
        suggestions: ["Mittelständische Marken", "Start-ups nach Series A", "Kick-off-Workshop"],
      },
    },
    company: {
      offerings: {
        key: "offerings",
        label: "Angebote",
        question: "Welche Produkte oder Leistungen bietet ihr an — und wie unterscheiden sie sich voneinander?",
        suggestions: ["Zwei Abostufen", "Beratungspaket", "API-Zugang"],
      },
      facts: {
        key: "facts",
        label: "Nachprüfbare Fakten",
        question: "Welche belegbaren Angaben gehören dazu — Preise, Verfügbarkeit, Integrationen, Umgang mit Daten?",
        suggestions: ["Ab 29 CHF pro Monat", "Daten in der EU", "Integration mit Slack"],
      },
      audience: {
        key: "audience",
        label: "Zielgruppe",
        question: "Für wen ist das Angebot gedacht, und für wen ausdrücklich nicht?",
        suggestions: ["Kleine Teams", "Agenturen", "Nicht für Konzerne"],
      },
    },
    project: {
      offerings: {
        key: "offerings",
        label: "Angebote",
        question: "Was leistet das Projekt konkret, und welche Teile sind öffentlich nutzbar?",
        suggestions: ["Open-Source-Bibliothek", "Öffentliche API", "Dokumentation"],
      },
      facts: {
        key: "facts",
        label: "Nachprüfbare Fakten",
        question: "Welche nachprüfbaren Angaben gibt es — Lizenz, Stand der Entwicklung, Roadmap, Mitwirkende?",
        suggestions: ["MIT-Lizenz", "Version 0.4", "Beiträge über Pull Requests"],
      },
      audience: {
        key: "audience",
        label: "Zielgruppe",
        question: "Wer nutzt das Projekt, und wer sollte mitarbeiten?",
        suggestions: ["Entwickler:innen", "Forschung", "Selbst-Hosting"],
      },
    },
  };
  const fallback: Record<string, GapDef> = {
    offerings: {
      key: "offerings",
      label: "Angebote",
      question: "Was bietest du konkret an? Nenne die wichtigsten Leistungen oder Inhalte.",
      suggestions: ["Beratung", "Digitales Produkt", "Workshops"],
    },
    facts: {
      key: "facts",
      label: "Nachprüfbare Fakten",
      question: "Welche nachprüfbaren Angaben sollen AI-Assistenten kennen — Standort, seit wann, Sprachen, Arbeitsweise?",
      suggestions: ["Standort Zürich", "Seit 2020", "Deutsch und Englisch"],
    },
    audience: {
      key: "audience",
      label: "Zielgruppe",
      question: "Für wen ist das gedacht?",
      suggestions: ["Kleine Teams", "Privatpersonen", "Institutionen"],
    },
  };
  return byType[type]?.[key] ?? fallback[key]!;
}

/** Liefert alle offenen Lücken in Prioritätsreihenfolge. */
export function openGaps(core: LooseCore): GapDef[] {
  const gaps: GapDef[] = [];
  if (!core.name)
    gaps.push({
      key: "name",
      label: "Name",
      question: "Unter welchem Namen sollen AI-Assistenten dich oder euch kennen?",
      suggestions: [],
    });
  if (core.entityType === "unknown")
    gaps.push({
      key: "entity_type",
      label: "Entity-Typ",
      question: "Bist du eine Einzelperson, ein Studio, ein Unternehmen, eine Organisation oder ein Projekt?",
      suggestions: ["Einzelperson", "Studio", "Unternehmen", "Projekt"],
    });
  if (core.summary.length < 60)
    gaps.push({
      key: "summary",
      label: "Zusammenfassung",
      question: "Beschreibe in zwei bis drei Sätzen, was du tust und was dich unterscheidet.",
      suggestions: [],
    });
  if (core.items.length === 0) gaps.push(domainQuestion(core.entityType, "offerings"));
  if (core.facts.filter((f) => f.status === "verified").length < 3) gaps.push(domainQuestion(core.entityType, "facts"));
  if (!core.facts.some((f) => /zielgruppe|audience|für wen/i.test(f.label))) gaps.push(domainQuestion(core.entityType, "audience"));
  if (core.faqs.length < 2)
    gaps.push({
      key: "faq",
      label: "FAQ",
      question: "Welche zwei Fragen werden dir am häufigsten gestellt — und wie lauten die kurzen Antworten?",
      suggestions: [],
    });
  if (!core.links.length && !core.website)
    gaps.push({
      key: "contact",
      label: "Kontakt",
      question: "Wo sollen Interessierte hin — Website, Kontaktseite oder Profil?",
      suggestions: [],
    });
  return gaps;
}

export function nextGap(core: LooseCore): GapDef {
  return (
    openGaps(core)[0] ?? {
      key: "none",
      label: "Vollständig",
      question: "",
      suggestions: [],
    }
  );
}

export function confidenceOf(core: LooseCore): number {
  const total = 8;
  const open = openGaps(core).length;
  return Math.max(0.1, Math.min(1, (total - open) / total));
}

export function isComplete(core: LooseCore): boolean {
  return openGaps(core).length === 0;
}

/* --------------------------- Antworten mergen --------------------------- */

function pushFact(core: LooseCore, label: string, value: string) {
  if (!value) return;
  const existing = core.facts.findIndex((f) => f.label.toLowerCase() === label.toLowerCase());
  const fact: LooseFact = { label, value, status: "verified" };
  if (existing >= 0) core.facts[existing] = fact;
  else core.facts.push(fact);
}

/**
 * Führt eine Nutzerantwort deterministisch in den Knowledge Core ein.
 * Es wird nichts interpretiert, was nicht wörtlich gesagt wurde.
 */
export function applyAnswer(input: LooseCore, answer: string, gap: GapKey): LooseCore {
  const core: LooseCore = { ...input, facts: [...input.facts], items: [...input.items], faqs: [...input.faqs], links: [...input.links] };
  const text = answer.trim();
  if (!text) return core;

  const url = extractUrl(text);
  if (url && !core.website) core.website = url;
  if (url && !core.links.some((l) => l.url === url)) core.links.push({ label: "Website", url });
  core.entityType = detectEntityType(text, core.entityType);

  switch (gap) {
    case "name":
      core.name = text.split(/[\n.]/)[0]!.slice(0, 120);
      break;
    case "entity_type":
      core.entityType = detectEntityType(text, "unknown");
      break;
    case "summary":
      core.summary = text.slice(0, 1200);
      if (!core.tagline) core.tagline = text.split(/[.\n]/)[0]!.slice(0, 120);
      break;
    case "offerings":
      for (const line of text.split(/[\n;•]|,\s(?=[A-ZÄÖÜ])/).map((l) => l.trim()).filter((l) => l.length > 2)) {
        const [name, ...rest] = line.split(/[:–-]\s/);
        core.items.push({ kind: "offering", name: name!.slice(0, 120), summary: rest.join(" ").slice(0, 400) || line.slice(0, 400) });
      }
      break;
    case "facts":
      for (const line of text.split(/[\n;•]/).map((l) => l.trim()).filter(Boolean)) {
        const [label, ...rest] = line.split(/:\s/);
        if (rest.length) pushFact(core, label!.slice(0, 80), rest.join(": ").slice(0, 400));
        else pushFact(core, `Fakt ${core.facts.length + 1}`, line.slice(0, 400));
      }
      break;
    case "audience":
      pushFact(core, "Zielgruppe", text.slice(0, 400));
      break;
    case "faq": {
      for (const block of text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)) {
        const [q, ...a] = block.split(/\n|\?\s/);
        core.faqs.push({ question: `${q!.replace(/\?$/, "").trim()}?`.slice(0, 200), answer: a.join(" ").trim().slice(0, 800) });
      }
      break;
    }
    case "contact":
      if (url) core.website = url;
      else pushFact(core, "Kontakt", text.slice(0, 200));
      break;
    default:
      pushFact(core, `Notiz ${core.facts.length + 1}`, text.slice(0, 400));
  }

  if (!core.name && gap !== "name") core.name = core.name || "";
  core.gaps = openGaps(core).map((g) => g.label);
  return core;
}

/** Tiefes, konservatives Zusammenführen eines strukturierten core_update. */
export function mergeCore(base: LooseCore, update: unknown): LooseCore {
  const u = normalizeCore(update);
  const merged: LooseCore = {
    ...base,
    entityType: u.entityType !== "unknown" ? u.entityType : base.entityType,
    name: u.name || base.name,
    tagline: u.tagline || base.tagline,
    summary: u.summary || base.summary,
    ...(u.location || base.location ? { location: u.location || base.location! } : {}),
    ...(u.website || base.website ? { website: u.website || base.website! } : {}),
    ...(u.languages?.length || base.languages?.length ? { languages: u.languages?.length ? u.languages : base.languages! } : {}),
    facts: [...base.facts],
    stories: [...base.stories],
    items: [...base.items],
    faqs: [...base.faqs],
    cv: [...base.cv],
    links: [...base.links],
    gaps: [],
  };
  for (const f of u.facts) {
    const i = merged.facts.findIndex((x) => x.label.toLowerCase() === f.label.toLowerCase());
    if (i >= 0) merged.facts[i] = f;
    else merged.facts.push(f);
  }
  for (const s of u.stories) if (!merged.stories.some((x) => x.text === s.text)) merged.stories.push(s);
  for (const i of u.items) {
    const at = merged.items.findIndex((x) => x.name.toLowerCase() === i.name.toLowerCase());
    if (at >= 0) merged.items[at] = i;
    else merged.items.push(i);
  }
  for (const f of u.faqs) if (!merged.faqs.some((x) => x.question.toLowerCase() === f.question.toLowerCase())) merged.faqs.push(f);
  for (const c of u.cv) if (!merged.cv.some((x) => x.role === c.role && x.organization === c.organization)) merged.cv.push(c);
  for (const l of u.links) if (!merged.links.some((x) => x.url === l.url)) merged.links.push(l);
  merged.gaps = openGaps(merged).map((g) => g.label);
  return merged;
}

/* ------------------------------ Bewertung ------------------------------- */

export function reviewCore(core: LooseCore, insight?: string) {
  const gaps = openGaps(core);
  const strengths: string[] = [];
  if (core.name && core.summary.length >= 60) strengths.push("Identität und Zusammenfassung sind vorhanden.");
  if (core.facts.filter((f) => f.status === "verified").length >= 3)
    strengths.push(`${core.facts.filter((f) => f.status === "verified").length} nachprüfbare Fakten sind erfasst.`);
  if (core.items.length) strengths.push(`${core.items.length} Angebote oder Inhalte sind beschrieben.`);
  if (core.faqs.length >= 2) strengths.push("Die FAQ beantwortet wiederkehrende Fragen.");
  if (core.links.length || core.website) strengths.push("Ein Kontakt- oder Website-Link ist hinterlegt.");

  const missing = gaps.map((g) => g.label);
  const suggestions = gaps.slice(0, 4).map((g) => ({
    title: g.label,
    why: g.question,
  }));

  if (insight) {
    suggestions.unshift({
      title: "Hinweis aufnehmen",
      why: `Ergänze den Knowledge Core um die Information, die zu diesem Hinweis fehlt: „${insight.slice(0, 200)}".`,
    });
  }

  const headline = gaps.length
    ? `${gaps.length} offene Stelle${gaps.length === 1 ? "" : "n"} — die wichtigste ist: ${gaps[0]!.label}.`
    : "Der Knowledge Core ist vollständig genug für AI-Assistenten.";

  return { headline, strengths, missing, suggestions, nextQuestion: gaps[0]?.question ?? "", exampleAnswers: gaps[0]?.suggestions ?? [] };
}

/** Ein vollständiger, deterministischer Interview-Schritt (Website-Flow). */
export function interviewStep({ core, message }: { core: unknown; message: string }) {
  const current = normalizeCore(core);
  const gap = nextGap(current);
  const updated = applyAnswer(current, message, gap.key);
  if (!updated.name && message.trim()) {
    // Erste Nachricht ohne erkannten Namen: als Zusammenfassung behalten.
    if (!updated.summary) updated.summary = message.trim().slice(0, 1200);
  }
  const next = nextGap(updated);
  return {
    reply: next.key === "none" ? "Alles Wesentliche ist erfasst." : `Notiert: ${gap.label}.`,
    question: next.question,
    suggestions: next.suggestions,
    core: updated,
    confidence: confidenceOf(updated),
    interviewComplete: isComplete(updated),
  };
}
