/**
 * Browser management session: cookie authority, CSRF binding, fail-closed
 * signing, and the rule that a draft session id can never manage a Presence.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";

process.env["MANAGE_COOKIE_SECRET"] = "test-manage-secret-value-0123456789";

import {
  MANAGE_CSRF_HEADER,
  issueManageSession,
  parseCookies,
  serializeCookie,
  timingSafeEqual,
  verifyManageSession,
} from "../src/lib/manage-auth.server";
import { parseRecoveryCode } from "../src/lib/mcp/presences";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("management session cookie", () => {
  let cookie: { value: string; csrf: string };
  beforeAll(async () => {
    cookie = await issueManageSession("acme");
  });

  it("authenticates a read with a valid cookie and no CSRF", async () => {
    expect(await verifyManageSession(cookie.value)).toEqual({ slug: "acme" });
  });

  it("accepts a write with the bound CSRF token", async () => {
    expect(await verifyManageSession(cookie.value, cookie.csrf)).toEqual({ slug: "acme" });
  });

  it("rejects a write with a wrong or missing CSRF token", async () => {
    expect(await verifyManageSession(cookie.value, "wrong")).toBeNull();
    expect(await verifyManageSession(cookie.value, "")).toBeNull();
  });

  it("rejects a missing, malformed or tampered cookie", async () => {
    expect(await verifyManageSession(undefined)).toBeNull();
    expect(await verifyManageSession("nonsense")).toBeNull();
    const tampered = cookie.value.replace(/^acme/, "other");
    expect(await verifyManageSession(tampered)).toBeNull();
  });

  it("rejects an expired cookie", async () => {
    const [slug, , csrf, mac] = cookie.value.split(".");
    expect(await verifyManageSession(`${slug}.1.${csrf}.${mac}`)).toBeNull();
  });

  it("fails closed when the signing secret is absent", async () => {
    const previous = process.env["MANAGE_COOKIE_SECRET"];
    const previousSubject = process.env["SUBJECT_HASH_SECRET"];
    delete process.env["MANAGE_COOKIE_SECRET"];
    delete process.env["SUBJECT_HASH_SECRET"];
    await expect(issueManageSession("acme")).rejects.toThrow(/MANAGE_SESSION_SECRET_MISSING/);
    expect(await verifyManageSession(cookie.value)).toBeNull();
    process.env["MANAGE_COOKIE_SECRET"] = previous!;
    if (previousSubject) process.env["SUBJECT_HASH_SECRET"] = previousSubject;
  });

  it("serializes an HttpOnly, Secure, SameSite=Strict cookie", () => {
    const serialized = serializeCookie("crawler_manage", cookie.value, { httpOnly: true, maxAge: 600 });
    expect(serialized).toContain("HttpOnly");
    expect(serialized).toContain("Secure");
    expect(serialized).toContain("SameSite=Strict");
    expect(serialized).toContain("Path=/");
  });

  it("parses cookies without leaking other values", () => {
    const jar = parseCookies("a=1; crawler_manage=xyz; b=2");
    expect(jar["crawler_manage"]).toBe("xyz");
  });

  it("compares MACs in constant time and length-safely", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("a draft session id is not a management capability", () => {
  it("never parses as a recovery code", () => {
    expect(parseRecoveryCode("sess_0123456789abcdef")).toBeNull();
    expect(parseRecoveryCode("acme~sess_0123456789abcdef")).toBeNull();
  });
});

describe("management handlers take their authority from the cookie", () => {
  const fns = read("src/lib/manage.functions.ts");

  it("no management handler resolves a Presence from a request-body code", () => {
    // Only the secret rotation and the session reissue still confirm with the
    // independent recovery code; everything else is cookie-authorised.
    const codeResolves = fns.match(/await resolve\(data\.code\)/g) ?? [];
    expect(codeResolves.length).toBeLessThanOrEqual(2);
    expect(fns).toContain("resolveSession({ write: true })");
    expect(fns).toContain("resolveSession({ write: false })");
  });

  it("never returns a raw session capability to the browser", () => {
    expect(fns).not.toContain("sessionToken: p.sessionToken");
  });

  it("sends the CSRF header on every server function call", () => {
    expect(read("src/start.ts")).toContain(MANAGE_CSRF_HEADER);
  });
});

describe("browser storage", () => {
  it("keeps draft session capabilities out of localStorage", () => {
    const hook = read("src/hooks/use-session-sync.ts");
    expect(hook).toContain("sessionStorage.setItem(LAST_SESSION_KEY");
    expect(hook).not.toContain("localStorage.setItem(LAST_SESSION_KEY");
    expect(hook).toContain("localStorage.removeItem(LAST_SESSION_KEY)");
  });

  it("clears the recovery code from memory once the cookie exists", () => {
    const page = read("src/routes/manage.tsx");
    expect(page).toContain("openManageSession");
    expect(page).toContain('setCode("")');
  });
});
