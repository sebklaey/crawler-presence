import { describe, expect, it } from "bun:test";

import {
  applyAnswer,
  confidenceOf,
  detectEntityType,
  extractUrl,
  interviewStep,
  isComplete,
  mergeCore,
  nextGap,
  normalizeCore,
  openGaps,
  reviewCore,
  type LooseCore,
} from "../interview-rules";

const base = (overrides: Partial<LooseCore> = {}): LooseCore => ({
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
  ...overrides,
});

/** A core without a single open gap. */
const filled = (overrides: Partial<LooseCore> = {}): LooseCore =>
  base({
    entityType: "studio",
    name: "Aurora",
    summary:
      "Aurora ist ein Designstudio in Zürich und arbeitet für Marken und Institutionen an Identitäten.",
    website: "https://aurora.example",
    facts: [
      { label: "Gegründet", value: "2019", status: "verified" },
      { label: "Team", value: "5 Personen", status: "verified" },
      { label: "Zielgruppe", value: "Marken", status: "verified" },
    ],
    items: [{ kind: "offering", name: "Markenidentität", summary: "Identitäten" }],
    faqs: [
      { question: "Wie startet ihr?", answer: "Mit einem Workshop." },
      { question: "Was kostet das?", answer: "Ab 5000 CHF." },
    ],
    links: [{ label: "Website", url: "https://aurora.example" }],
    ...overrides,
  });

describe("normalizeCore", () => {
  it("returns an empty core for junk input", () => {
    for (const raw of [null, undefined, 42, "text"]) {
      const core = normalizeCore(raw);
      expect(core.entityType).toBe("unknown");
      expect(core.name).toBe("");
      expect(core.facts).toEqual([]);
    }
  });

  it("trims strings, rejects unknown entity types and drops optional empties", () => {
    const core = normalizeCore({
      entityType: "alien",
      name: "  Aurora  ",
      location: "   ",
      languages: [],
    });
    expect(core.entityType).toBe("unknown");
    expect(core.name).toBe("Aurora");
    expect(core).not.toHaveProperty("location");
    expect(core).not.toHaveProperty("languages");
  });

  it("keeps known entity types and non-empty optionals", () => {
    const core = normalizeCore({
      entityType: "company",
      location: "Zurich",
      website: "https://x.example",
      languages: ["de"],
    });
    expect(core.entityType).toBe("company");
    expect(core.location).toBe("Zurich");
    expect(core.website).toBe("https://x.example");
    expect(core.languages).toEqual(["de"]);
  });

  it("filters incomplete list entries and non-array lists", () => {
    const core = normalizeCore({
      facts: [
        { label: "A", value: "1", status: "verified" },
        { label: "", value: "2" },
        { label: "B", value: "" },
      ],
      stories: [
        { label: "s", text: "hi", confirmed: false },
        { label: "x", text: "" },
      ],
      items: "nope",
      faqs: [
        { question: "Q?", answer: "A" },
        { question: "", answer: "A" },
      ],
      cv: [{ role: "Founder" }, { role: "" }],
      links: [
        { label: "L", url: "https://x.example" },
        { label: "L", url: "" },
      ],
      gaps: ["Name", ""],
    });
    expect(core.facts).toHaveLength(1);
    expect(core.stories).toHaveLength(1);
    expect(core.items).toEqual([]);
    expect(core.faqs).toHaveLength(1);
    expect(core.cv).toHaveLength(1);
    expect(core.links).toHaveLength(1);
    expect(core.gaps).toEqual(["Name"]);
  });
});

describe("detectEntityType", () => {
  it("keeps an already known type", () => {
    expect(detectEntityType("ich bin Fotograf", "company")).toBe("company");
  });

  it("derives the type from keywords, case-insensitively", () => {
    expect(detectEntityType("Ich bin Fotograf in Bern", "unknown")).toBe("creator");
    expect(detectEntityType("Wir sind ein Designstudio", "unknown")).toBe("studio");
    expect(detectEntityType("Wir sind eine GmbH", "unknown")).toBe("company");
    expect(detectEntityType("Ein Verein aus Zürich", "unknown")).toBe("organization");
    expect(detectEntityType("Ein Open-Source-Projekt", "unknown")).toBe("project");
    expect(detectEntityType("Ich bin freiberuflich unterwegs", "unknown")).toBe("person");
  });

  it("stays unknown without a hint", () => {
    expect(detectEntityType("Hallo zusammen", "unknown")).toBe("unknown");
  });
});

describe("extractUrl", () => {
  it("prefers an explicit http(s) url", () => {
    expect(extractUrl("Mehr auf https://aurora.example/work (schau rein)")).toBe(
      "https://aurora.example/work",
    );
  });

  it("upgrades a bare domain to https", () => {
    expect(extractUrl("Wir sind unter aurora.example erreichbar")).toBe("https://aurora.example");
  });

  it("returns undefined without a url", () => {
    expect(extractUrl("Kein Link hier")).toBeUndefined();
  });
});

describe("openGaps / nextGap / confidenceOf / isComplete", () => {
  it("asks for the name first on an empty core", () => {
    const gaps = openGaps(base());
    expect(gaps[0]?.key).toBe("name");
    expect(gaps.map((g) => g.key)).toEqual([
      "name",
      "entity_type",
      "summary",
      "offerings",
      "facts",
      "audience",
      "faq",
      "contact",
    ]);
    expect(nextGap(base()).key).toBe("name");
    expect(isComplete(base())).toBe(false);
  });

  it("reports no gaps for a filled core", () => {
    expect(openGaps(filled())).toEqual([]);
    expect(nextGap(filled()).key).toBe("none");
    expect(isComplete(filled())).toBe(true);
    expect(confidenceOf(filled())).toBe(1);
  });

  it("floors confidence at 0.1 and rises as gaps close", () => {
    expect(confidenceOf(base())).toBe(0.1);
    expect(confidenceOf(filled({ faqs: [] }))).toBeCloseTo(7 / 8, 5);
  });

  it("uses domain-specific questions per entity type", () => {
    const creator = openGaps(base({ entityType: "creator" })).find((g) => g.key === "offerings");
    const company = openGaps(base({ entityType: "company" })).find((g) => g.key === "offerings");
    const unknown = openGaps(base()).find((g) => g.key === "offerings");
    expect(creator?.question).not.toBe(company?.question);
    expect(unknown?.suggestions).toContain("Beratung");
    expect(creator?.suggestions).toContain("Workshops");
  });

  it("treats an audience fact as closing the audience gap", () => {
    const withAudience = filled({ faqs: [] });
    expect(openGaps(withAudience).map((g) => g.key)).toEqual(["faq"]);
  });
});

describe("applyAnswer", () => {
  it("ignores an empty answer but never mutates the input", () => {
    const input = base();
    const out = applyAnswer(input, "   ", "name");
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it("takes the first sentence as the name", () => {
    const out = applyAnswer(base(), "Aurora Studio. Wir machen Design.", "name");
    expect(out.name).toBe("Aurora Studio");
  });

  it("re-detects the entity type from the answer", () => {
    const out = applyAnswer(base({ name: "Aurora" }), "Wir sind ein Studio", "entity_type");
    expect(out.entityType).toBe("studio");
  });

  it("stores the summary and derives a tagline once", () => {
    const out = applyAnswer(base(), "Wir gestalten Marken. Seit 2019.", "summary");
    expect(out.summary).toBe("Wir gestalten Marken. Seit 2019.");
    expect(out.tagline).toBe("Wir gestalten Marken");
    const again = applyAnswer(out, "Ein anderer Text.", "summary");
    expect(again.tagline).toBe("Wir gestalten Marken");
  });

  it("splits offerings into catalog items", () => {
    const out = applyAnswer(
      base(),
      "Markenidentität: Logos und Systeme\nBeratung: Strategie",
      "offerings",
    );
    expect(out.items).toEqual([
      { kind: "offering", name: "Markenidentität", summary: "Logos und Systeme" },
      { kind: "offering", name: "Beratung", summary: "Strategie" },
    ]);
  });

  it("falls back to the whole line as the offering summary", () => {
    const out = applyAnswer(base(), "Workshops", "offerings");
    expect(out.items).toEqual([{ kind: "offering", name: "Workshops", summary: "Workshops" }]);
  });

  it("splits facts on labels and falls back to numbered facts", () => {
    const out = applyAnswer(base(), "Gegründet: 2019; Zürich", "facts");
    expect(out.facts).toEqual([
      { label: "Gegründet", value: "2019", status: "verified" },
      { label: "Fakt 2", value: "Zürich", status: "verified" },
    ]);
  });

  it("overwrites a fact with the same label", () => {
    const once = applyAnswer(base(), "Team: 3 Personen", "facts");
    const twice = applyAnswer(once, "team: 5 Personen", "facts");
    expect(twice.facts).toEqual([{ label: "team", value: "5 Personen", status: "verified" }]);
  });

  it("stores the audience as a verified fact", () => {
    const out = applyAnswer(base(), "Kleine Teams und Agenturen", "audience");
    expect(out.facts[0]).toEqual({
      label: "Zielgruppe",
      value: "Kleine Teams und Agenturen",
      status: "verified",
    });
  });

  it("parses faq blocks into question and answer", () => {
    const out = applyAnswer(
      base(),
      "Wie startet ihr?\nMit einem Workshop.\n\nWas kostet das?\nAb 5000 CHF.",
      "faq",
    );
    expect(out.faqs).toEqual([
      { question: "Wie startet ihr?", answer: "Mit einem Workshop." },
      { question: "Was kostet das?", answer: "Ab 5000 CHF." },
    ]);
  });

  it("uses a contact url as the website and otherwise stores a contact fact", () => {
    const withUrl = applyAnswer(base(), "https://aurora.example/kontakt", "contact");
    expect(withUrl.website).toBe("https://aurora.example/kontakt");
    const withoutUrl = applyAnswer(base(), "Am besten per Telefon", "contact");
    expect(withoutUrl.facts[0]?.label).toBe("Kontakt");
  });

  it("captures a url mentioned in any answer exactly once", () => {
    const out = applyAnswer(base(), "Zielgruppe siehe https://aurora.example", "audience");
    expect(out.website).toBe("https://aurora.example");
    expect(out.links).toEqual([{ label: "Website", url: "https://aurora.example" }]);
    const again = applyAnswer(out, "Nochmal https://aurora.example", "audience");
    expect(again.links).toHaveLength(1);
  });

  it("records an unmatched gap as a note and recomputes the gap labels", () => {
    const out = applyAnswer(base(), "Irgendeine Notiz", "none");
    expect(out.facts[0]?.label).toBe("Notiz 1");
    expect(out.gaps).toEqual(openGaps(out).map((g) => g.label));
  });
});

describe("mergeCore", () => {
  it("keeps existing values when the update is empty", () => {
    const merged = mergeCore(filled(), {});
    expect(merged.name).toBe("Aurora");
    expect(merged.entityType).toBe("studio");
    expect(merged.facts).toHaveLength(3);
  });

  it("overwrites scalars and replaces facts and items by label/name", () => {
    const merged = mergeCore(filled(), {
      entityType: "company",
      name: "Aurora AG",
      facts: [{ label: "gegründet", value: "2020", status: "verified" }],
      items: [{ kind: "service", name: "markenidentität", summary: "Neu" }],
    });
    expect(merged.entityType).toBe("company");
    expect(merged.name).toBe("Aurora AG");
    expect(merged.facts.filter((f) => f.label.toLowerCase() === "gegründet")).toEqual([
      { label: "gegründet", value: "2020", status: "verified" },
    ]);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]?.kind).toBe("service");
  });

  it("appends new entries and de-duplicates stories, faqs, cv and links", () => {
    const update = {
      stories: [{ label: "Positionierung", text: "Senior Team.", confirmed: true }],
      faqs: [
        { question: "WIE STARTET IHR?", answer: "Anders." },
        { question: "Neu?", answer: "Ja." },
      ],
      cv: [{ role: "Founder", organization: "Aurora" }],
      links: [
        { label: "Website", url: "https://aurora.example" },
        { label: "Blog", url: "https://blog.example" },
      ],
    };
    const once = mergeCore(filled(), update);
    const twice = mergeCore(once, update);
    expect(twice.stories).toHaveLength(1);
    expect(twice.faqs.map((f) => f.question)).toEqual([
      "Wie startet ihr?",
      "Was kostet das?",
      "Neu?",
    ]);
    expect(twice.cv).toHaveLength(1);
    expect(twice.links.map((l) => l.url)).toEqual([
      "https://aurora.example",
      "https://blog.example",
    ]);
  });

  it("never mutates the base core and always recomputes the gaps", () => {
    const input = base();
    const merged = mergeCore(input, {
      name: "Aurora",
      facts: [{ label: "A", value: "1", status: "verified" }],
    });
    expect(input.facts).toEqual([]);
    expect(merged.gaps).toEqual(openGaps(merged).map((g) => g.label));
  });
});

describe("reviewCore", () => {
  it("summarizes strengths and reports no gaps for a filled core", () => {
    const review = reviewCore(filled());
    expect(review.missing).toEqual([]);
    expect(review.suggestions).toEqual([]);
    expect(review.headline).toContain("vollständig");
    expect(review.strengths.length).toBeGreaterThanOrEqual(4);
    expect(review.nextQuestion).toBe("");
  });

  it("names the most important gap and caps the suggestions at four", () => {
    const review = reviewCore(base());
    expect(review.headline).toContain("8 offene Stellen");
    expect(review.headline).toContain("Name");
    expect(review.suggestions).toHaveLength(4);
    expect(review.nextQuestion).not.toBe("");
    expect(review.strengths).toEqual([]);
  });

  it("uses the singular for a single gap", () => {
    expect(reviewCore(filled({ faqs: [] })).headline).toContain("1 offene Stelle —");
  });

  it("puts an external insight in front of the suggestions", () => {
    const review = reviewCore(filled(), "Preise fehlen");
    expect(review.suggestions[0]?.title).toBe("Hinweis aufnehmen");
    expect(review.suggestions[0]?.why).toContain("Preise fehlen");
  });
});

describe("interviewStep", () => {
  it("answers the current gap and moves on to the next one", () => {
    const step = interviewStep({ core: base(), message: "Aurora Studio" });
    expect(step.core.name).toBe("Aurora Studio");
    expect(step.reply).toBe("Notiert: Name.");
    expect(step.question).toBe(nextGap(step.core).question);
    expect(step.interviewComplete).toBe(false);
    expect(step.confidence).toBeGreaterThan(0.1);
  });

  it("keeps a message that yields no name as the summary", () => {
    const step = interviewStep({
      core: base(),
      message: ". Wir gestalten Marken für kleine Teams",
    });
    expect(step.core.name).toBe("");
    expect(step.core.summary).toBe(". Wir gestalten Marken für kleine Teams");
  });

  it("reports completion once nothing is open", () => {
    const step = interviewStep({
      core: filled({ faqs: [] }),
      message: "Wie startet ihr?\nMit einem Workshop.\n\nWas kostet das?\nAb 5000 CHF.",
    });
    expect(step.interviewComplete).toBe(true);
    expect(step.reply).toBe("Alles Wesentliche ist erfasst.");
    expect(step.question).toBe("");
    expect(step.suggestions).toEqual([]);
  });
});
