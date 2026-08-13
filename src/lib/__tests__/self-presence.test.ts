import { describe, expect, it } from "bun:test";

import { crawlerCore, selfFile, selfFiles, serveSelfFile } from "../self-presence";
import { presenceScore } from "../knowledge";

describe("crawlerCore", () => {
  it("is a complete, publishable presence built from verified facts only", () => {
    const core = crawlerCore();
    expect(core.name).toBe("Crawler");
    expect(core.entityType).toBe("company");
    expect(presenceScore(core)).toBe(100);
    expect(core.facts.every((f) => f.status === "verified")).toBe(true);
  });
});

describe("selfFiles / selfFile", () => {
  it("caches the generated files across calls", () => {
    expect(selfFiles()).toBe(selfFiles());
  });

  it("always serves llms.txt, about.md and the entity endpoint", () => {
    const paths = selfFiles().map((f) => f.path);
    expect(paths).toContain("llms.txt");
    expect(paths).toContain("about.md");
    expect(paths).toContain("api/entity.json");
    expect(paths).toContain("llms-full.txt");
  });

  it("looks a file up by exact path", () => {
    expect(selfFile("llms.txt")?.type).toBe("text");
    expect(selfFile("/llms.txt")).toBeUndefined();
    expect(selfFile("nope.md")).toBeUndefined();
  });
});

describe("serveSelfFile", () => {
  const get = (path: string, headers: Record<string, string> = {}) =>
    serveSelfFile(path, new Request(`https://crawler.today/${path}`, { headers }));

  it("serves the file with its content type, cache and canonical headers", async () => {
    const response = get("llms.txt");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(response.headers.get("link")).toContain('rel="canonical"');
    expect(await response.text()).toContain("# Crawler");
  });

  it("uses the matching content type per file type", () => {
    expect(get("about.md").headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(get("api/entity.json").headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
  });

  it("returns a stable etag and answers 304 when it matches", () => {
    const etag = get("about.md").headers.get("etag")!;
    expect(etag).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
    expect(get("about.md").headers.get("etag")).toBe(etag);

    const cached = get("about.md", { "if-none-match": etag });
    expect(cached.status).toBe(304);
    expect(cached.headers.get("etag")).toBe(etag);

    expect(get("about.md", { "if-none-match": '"stale"' }).status).toBe(200);
  });

  it("gives different files different etags", () => {
    expect(get("about.md").headers.get("etag")).not.toBe(get("llms.txt").headers.get("etag"));
  });

  it("answers 404 with the list of available files", async () => {
    const response = get("missing.md");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("llms.txt");
  });
});
