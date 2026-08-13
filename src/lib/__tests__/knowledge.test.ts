import { describe, expect, it } from "bun:test";

import {
  buildAboutMd,
  buildCvMd,
  buildFaqMd,
  buildLlmsFullTxt,
  buildLlmsTxt,
  catalogJson,
  emptyCore,
  entityJson,
  entityLabel,
  generatedFiles,
  isCoreEmpty,
  presenceChecks,
  presenceLabel,
  presenceScore,
  presenceSlug,
} from "../knowledge";
import { completeCore, fact, item, withoutWebsite } from "./fixtures";

describe("emptyCore / isCoreEmpty", () => {
  it("starts unknown, empty and timestamped", () => {
    const core = emptyCore();
    expect(core.entityType).toBe("unknown");
    expect(core.facts).toEqual([]);
    expect(Number.isNaN(Date.parse(core.updatedAt))).toBe(false);
    expect(isCoreEmpty(core)).toBe(true);
  });

  it("is no longer empty once a name, summary, fact or item exists", () => {
    expect(isCoreEmpty({ ...emptyCore(), name: "Aurora" })).toBe(false);
    expect(isCoreEmpty({ ...emptyCore(), summary: "Something" })).toBe(false);
    expect(isCoreEmpty({ ...emptyCore(), facts: [fact("Founded", "2019")] })).toBe(false);
    expect(isCoreEmpty({ ...emptyCore(), items: [item("offering", "Consulting")] })).toBe(false);
  });

  it("labels every entity type", () => {
    expect(entityLabel.unknown).toBe("Not yet identified");
    expect(Object.values(entityLabel).every(Boolean)).toBe(true);
  });
});

describe("presence checks and score", () => {
  it("scores an empty core at 0 and a complete core at 100", () => {
    expect(presenceScore(emptyCore())).toBe(0);
    expect(presenceScore(completeCore())).toBe(100);
  });

  it("marks identity as missing while the entity type is unknown", () => {
    const checks = presenceChecks(completeCore({ entityType: "unknown" }));
    expect(checks.find((c) => c.label === "Identity (name + type)")?.done).toBe(false);
  });

  it("requires a summary longer than 60 characters", () => {
    const short = presenceChecks(completeCore({ summary: "Too short" }));
    expect(short.find((c) => c.label === "Short summary")?.done).toBe(false);
  });

  it("counts only verified facts towards the three-fact check", () => {
    const claimedOnly = completeCore({
      facts: [fact("A", "1", "claimed"), fact("B", "2", "claimed"), fact("C", "3", "claimed")],
    });
    expect(
      presenceChecks(claimedOnly).find((c) => c.label === "At least 3 verified facts")?.done,
    ).toBe(false);
  });

  it("accepts a link when no website is set", () => {
    const linkOnly = withoutWebsite(
      completeCore({ links: [{ label: "Profile", url: "https://x.example" }] }),
    );
    expect(presenceChecks(linkOnly).find((c) => c.label === "Contact or website link")?.done).toBe(
      true,
    );
    const neither = withoutWebsite(completeCore({ links: [] }));
    expect(presenceChecks(neither).find((c) => c.label === "Contact or website link")?.done).toBe(
      false,
    );
  });

  it("drops exactly the weight of a failed check", () => {
    // FAQ check is worth 10 of 100 points.
    expect(presenceScore(completeCore({ faqs: [] }))).toBe(90);
  });
});

describe("presenceLabel", () => {
  it("maps score ranges to labels", () => {
    expect(presenceLabel(100)).toBe("Ready to publish");
    expect(presenceLabel(85)).toBe("Ready to publish");
    expect(presenceLabel(84)).toBe("Almost there");
    expect(presenceLabel(55)).toBe("Almost there");
    expect(presenceLabel(54)).toBe("Draft");
    expect(presenceLabel(1)).toBe("Draft");
    expect(presenceLabel(0)).toBe("Empty");
  });
});

describe("buildLlmsTxt", () => {
  it("falls back to placeholders for an empty core", () => {
    const txt = buildLlmsTxt(emptyCore());
    expect(txt).toContain("# Untitled presence");
    expect(txt).toContain("> AI-readable presence generated with Crawler.");
    expect(txt).toContain("No summary yet.");
    expect(txt).toContain("- None confirmed yet.");
  });

  it("lists only verified facts and the files that exist", () => {
    const txt = buildLlmsTxt(
      completeCore({ facts: [fact("Founded", "2019"), fact("Award", "None", "claimed")] }),
    );
    expect(txt).toContain("- Founded: 2019");
    expect(txt).not.toContain("Award");
    expect(txt).toContain("- [about.md](/about.md)");
    expect(txt).toContain("- [offerings.md](/offerings.md)");
    expect(txt).toContain("- [api/entity.json](/api/entity.json)");
    expect(txt).toContain("- [llms-full.txt](/llms-full.txt)");
    expect(txt.endsWith("\n")).toBe(true);
  });

  it("omits catalog files for kinds without records", () => {
    const txt = buildLlmsTxt(
      completeCore({ items: [item("project", "Museum site")], faqs: [], cv: [] }),
    );
    expect(txt).toContain("- [projects.md](/projects.md)");
    expect(txt).not.toContain("offerings.md");
    expect(txt).not.toContain("services.md");
    expect(txt).not.toContain("faq.md");
    expect(txt).not.toContain("cv.md");
    expect(txt).not.toContain("api/offerings.json");
  });
});

describe("buildAboutMd", () => {
  it("renders location, website, verified facts and confirmed stories", () => {
    const md = buildAboutMd(completeCore());
    expect(md).toContain("# About Aurora Studio");
    expect(md).toContain("**Location:** Zurich");
    expect(md).toContain("**Website:** https://aurora.example");
    expect(md).toContain("- **Founded:** 2019");
    expect(md).toContain("## Positioning and story");
    expect(md).not.toContain("_(unconfirmed draft)_");
  });

  it("marks unconfirmed stories and lists claimed facts separately", () => {
    const md = buildAboutMd(
      completeCore({
        stories: [{ id: "s1", label: "Draft", text: "Maybe this.", confirmed: false }],
        facts: [fact("Founded", "2019"), fact("Reach", "Global", "claimed")],
      }),
    );
    expect(md).toContain("_(unconfirmed draft)_");
    expect(md).toContain("## Unconfirmed claims");
    expect(md).toContain("- Reach: Global");
  });

  it("falls back when the core is empty", () => {
    const md = buildAboutMd(emptyCore());
    expect(md).toContain("# About this presence");
    expect(md).toContain("_No summary yet._");
    expect(md).toContain("_None yet._");
    expect(md).not.toContain("**Location:**");
  });
});

describe("buildFaqMd / buildCvMd", () => {
  it("renders questions as headings", () => {
    const md = buildFaqMd(completeCore());
    expect(md).toContain("# FAQ");
    expect(md).toContain("## How do we start?");
    expect(md).toContain("With a kick-off workshop.");
  });

  it("joins cv fields and appends the note", () => {
    const md = buildCvMd(completeCore());
    expect(md).toContain("# CV — Aurora Studio");
    expect(md).toContain("- 2019– · Founder · Aurora — Design lead");
  });

  it("skips missing cv fields", () => {
    const md = buildCvMd(completeCore({ cv: [{ id: "c1", role: "Founder" }] }));
    expect(md).toContain("- Founder\n");
  });
});

describe("entityJson / catalogJson", () => {
  it("nulls optional fields and splits verified from claimed facts", () => {
    const json = entityJson(
      completeCore({ facts: [fact("Founded", "2019"), fact("Reach", "Global", "claimed")] }),
    );
    expect(json.verified_facts).toEqual([{ label: "Founded", value: "2019", source: null }]);
    expect(json.unverified_claims).toEqual([{ label: "Reach", value: "Global" }]);
    expect(json.generated_by).toBe("Crawler");

    const bare = entityJson(emptyCore());
    expect(bare.location).toBeNull();
    expect(bare.website).toBeNull();
    expect(bare.languages).toEqual([]);
  });

  it("returns only the requested kind, with slugged ids", () => {
    const json = catalogJson(
      completeCore({ items: [item("offering", "Brand Identity!"), item("project", "Site")] }),
      "offering",
    );
    expect(json.type).toBe("offering");
    expect(json.count).toBe(1);
    expect(json.items[0]?.id).toBe("brand-identity");
    expect(json.items[0]?.tags).toEqual([]);
    expect(json.items[0]?.url).toBeNull();
  });
});

describe("generatedFiles", () => {
  it("generates only the relevant files for a minimal core", () => {
    const files = generatedFiles(emptyCore());
    expect(files.map((f) => f.path)).toEqual([
      "llms.txt",
      "about.md",
      "api/entity.json",
      "llms-full.txt",
    ]);
  });

  it("generates every file for a complete core and keeps valid JSON", () => {
    const files = generatedFiles(completeCore());
    expect(files.map((f) => f.path)).toEqual([
      "llms.txt",
      "about.md",
      "offerings.md",
      "projects.md",
      "services.md",
      "faq.md",
      "cv.md",
      "api/entity.json",
      "api/offerings.json",
      "api/projects.json",
      "api/services.json",
      "llms-full.txt",
    ]);
    for (const file of files.filter((f) => f.type === "json")) {
      expect(() => JSON.parse(file.content) as unknown).not.toThrow();
    }
  });

  it("renders catalog details, tags and links in the markdown", () => {
    const files = generatedFiles(
      completeCore({
        items: [
          item("offering", "Workshop", {
            details: "Two days",
            tags: ["design", "team"],
            url: "https://x.example",
          }),
        ],
      }),
    );
    const offerings = files.find((f) => f.path === "offerings.md")?.content ?? "";
    expect(offerings).toContain("# Offerings");
    expect(offerings).toContain("## Workshop");
    expect(offerings).toContain("Two days");
    expect(offerings).toContain("**Tags:** design, team");
    expect(offerings).toContain("**Link:** https://x.example");
  });
});

describe("buildLlmsFullTxt", () => {
  it("inlines the markdown files but never JSON or itself", () => {
    const full = buildLlmsFullTxt(completeCore());
    expect(full).toContain("# /about.md");
    expect(full).toContain("# /faq.md");
    expect(full).not.toContain("# /api/entity.json");
    expect(full).not.toContain("# /llms-full.txt");
    expect(full).not.toContain("# /llms.txt");
  });
});

describe("presenceSlug", () => {
  it("slugifies the name and falls back to 'presence'", () => {
    expect(presenceSlug(completeCore({ name: "Aurora Studio GmbH" }))).toBe("aurora-studio-gmbh");
    expect(presenceSlug(completeCore({ name: "  --Ärger--  " }))).toBe("rger");
    expect(presenceSlug(emptyCore())).toBe("presence");
    expect(presenceSlug(completeCore({ name: "!!!" }))).toBe("presence");
  });
});
