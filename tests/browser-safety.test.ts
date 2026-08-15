/**
 * Browser capability safety + public copy assertions.
 * Run: bun test tests/browser-safety.test.ts
 *
 * These are source-level guards: they fail the build if a removed unsafe
 * pattern or a stale public phrase comes back.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no literal capabilities in the tree", () => {
  test("no source or migration embeds a sess_ capability value", () => {
    const files = [
      ...walk(join(process.cwd(), "src")),
      ...walk(join(process.cwd(), "tests")),
      ...readdirSync(join(process.cwd(), "supabase", "migrations")).map((f) =>
        join(process.cwd(), "supabase", "migrations", f),
      ),
    ];
    const offenders = files.filter((f) => /sess_[a-zA-Z0-9]{20,}/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("localStorage never holds a management capability", () => {
  const store = read("src/lib/store.ts");

  test("the recovery code is not persisted", () => {
    expect(store).not.toContain('useLocal<string>(CODE_KEY');
    expect(store).toContain("recoveryCodeMemory");
    expect(store).toContain("purgeLegacyRecoveryCode");
  });

  test("a redaction helper exists for UI and logs", () => {
    expect(store).toContain("redactCapability");
  });
});

describe("session tokens leave the URL immediately", () => {
  const sync = read("src/hooks/use-session-sync.ts");

  test("the query parameter is stripped with history.replaceState", () => {
    expect(sync).toContain("history.replaceState");
    expect(sync).toContain('params.delete("session")');
  });
});

describe("browser management session", () => {
  const route = read("src/routes/api/manage-session.ts");

  test("the cookie is HttpOnly, Secure and SameSite=Strict with a short expiry", () => {
    expect(route).toContain("HttpOnly");
    expect(route).toContain("SameSite=Strict");
    expect(route).toContain("Secure");
    expect(route).toContain("const MAX_AGE = 30 * 60");
  });

  test("it carries a CSRF token and rejects a session id as a code", () => {
    expect(route).toContain("csrf");
    expect(route).toContain("parseRecoveryCode");
  });
});

describe("client plan state", () => {
  const limits = read("src/lib/plan-limits.tsx");

  test("free is never rewritten to plus", () => {
    expect(limits).not.toContain('stored === "free" ? "plus"');
  });

  test("a missing context fails closed", () => {
    expect(limits).toContain('{ plan: "free", state: "unavailable", guard: () => false }');
  });

  test("no optimistic plan unlock before payment", () => {
    expect(limits).not.toContain("setPlan(target)");
  });
});

describe("public copy", () => {
  const room = read("src/routes/room.tsx");
  const install = read("src/routes/install.tsx");
  const privacy = read("src/routes/privacy.tsx");
  const pricing = read("src/routes/pricing.tsx");

  test("the connector is called @crawler", () => {
    for (const file of walk(join(process.cwd(), "src", "routes"))) {
      expect(readFileSync(file, "utf8")).not.toContain("@crawlers");
    }
  });

  test("public profiles are described as optional", () => {
    expect(room).not.toContain("no account, no sign-up, no profiles");
    expect(room).toContain("optional");
    expect(privacy).toContain("optional");
  });

  test("a personal room is not promised to everyone for free", () => {
    expect(room).not.toContain("Everyone gets one permanent public room");
  });

  test("the Crawler room token is distinguished from the ChatGPT identity", () => {
    expect(room).toContain("Crawler never receives your ChatGPT account");
  });

  test("24-hour messages are distinguished from durable Presences", () => {
    expect(room).toContain("durable");
  });

  test("credentials are described as one-way hashes", () => {
    expect(privacy).toContain("one-way cryptographic hash");
    expect(privacy).toContain("can never be used as a recovery code");
  });

  test("the demo/test banner waits for a confirmed billing status", () => {
    expect(pricing).toContain("!paymentsLoading && !payments.configured");
    expect(read("src/components/payment-test-mode-banner.tsx")).toContain("if (loading) return null;");
  });

  test("/install documents developer mode, plugins and reconnecting", () => {
    expect(install).toContain("Developer mode");
    expect(install).toContain("Plugins");
    expect(install).toContain("Reconnect after updates");
  });
});
