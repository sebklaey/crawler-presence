/**
 * Website copy regression tests.
 * Run: bun test tests/copy.test.ts
 *
 * These guard the contradictions that were found in review: invented ChatGPT
 * identity, blanket 24-hour deletion, "@crawlers", claims of access to private
 * assistant conversations, and pricing that disagrees with the entitlement
 * catalog.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { PLAN_INFO } from "../src/lib/entitlements/catalog";
import { RETENTION_CATALOG } from "../src/lib/retention-catalog";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|md)$/.test(entry) && !entry.includes("routeTree.gen")) out.push(full);
  }
  return out;
}

const COPY_FILES = [...walk("src/routes"), ...walk("src/components")].filter(
  (f) => !f.includes("routeTree.gen"),
);
const copy = COPY_FILES.map((path) => ({ path, text: readFileSync(path, "utf8") }));

const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /@crawlers\b/, why: "the connector is invoked as @crawler" },
  {
    pattern: /ChatGPT (account )?identity is (passed|received|shared)/i,
    why: "Crawler never receives ChatGPT account identity",
  },
  {
    pattern: /(read|access|see)s? (your|all) (private )?(ChatGPT|assistant) conversations/i,
    why: "Crawler measures only what happens inside Crawler",
  },
  {
    pattern: /everything is deleted after 24 hours|all data is deleted after 24 hours/i,
    why: "retention differs per data class",
  },
  {
    pattern: /create an? (Crawler )?account|sign up for Crawler|log in to Crawler|Crawler login/i,
    why: "Crawler is accountless",
  },
  { pattern: /Demo \/ test mode\./, why: "billing status wording comes from server configuration" },
];

describe("website copy", () => {
  test("contains no forbidden or contradictory phrases", () => {
    const hits: string[] = [];
    for (const file of copy) {
      for (const rule of FORBIDDEN) {
        const match = file.text.match(rule.pattern);
        if (match) hits.push(`${file.path}: "${match[0]}" — ${rule.why}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test("privacy page renders the canonical retention catalog", () => {
    const privacy = readFileSync("src/routes/privacy.tsx", "utf8");
    expect(privacy).toContain("RETENTION_CATALOG");
    expect(privacy).not.toMatch(/Anonymous draft sessions expire after 30 days\. Minimized analytics/);
  });

  test("the retention catalog covers every required data class", () => {
    const joined = RETENTION_CATALOG.map((e) => `${e.data} ${e.retention}`).join(" ").toLowerCase();
    for (const needle of [
      "draft",
      "message",
      "presence",
      "analytics",
      "billing",
      "audit",
      "capabilit",
    ]) {
      expect(joined).toContain(needle);
    }
  });

  test("pricing is rendered from the entitlement catalog and matches the canonical prices", () => {
    const pricing = readFileSync("src/routes/pricing.tsx", "utf8");
    expect(pricing).toContain("PLAN_INFO");
    expect(PLAN_INFO.plus.price).toBe(5);
    expect(PLAN_INFO.pro.price).toBe(20);
    expect(PLAN_INFO.business.price).toBe(80);
  });

  test("capabilities are described as separate and hashed", () => {
    const privacy = readFileSync("src/routes/privacy.tsx", "utf8");
    expect(privacy).toContain("three distinct capabilities");
    expect(privacy).toMatch(/one-way (cryptographic )?hash/);
  });

  test("optional public profiles are acknowledged alongside 'no account'", () => {
    const privacy = readFileSync("src/routes/privacy.tsx", "utf8");
    expect(privacy).toMatch(/Public profiles.*optional/i);
  });
});
