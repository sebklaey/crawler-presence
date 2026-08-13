import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  betaFree,
  paymentsConfigured,
  paymentsEnvironment,
  releaseVersion,
  siteUrl,
} from "../site";

const KEYS = [
  "PUBLIC_SITE_URL",
  "PADDLE_ENV",
  "NODE_ENV",
  "PADDLE_LIVE_API_KEY",
  "PADDLE_SANDBOX_API_KEY",
  "PADDLE_API_KEY",
  "PAYMENTS_LIVE_WEBHOOK_SECRET",
  "PAYMENTS_SANDBOX_WEBHOOK_SECRET",
  "PADDLE_LIVE_WEBHOOK_SECRET",
  "PADDLE_SANDBOX_WEBHOOK_SECRET",
  "PADDLE_WEBHOOK_SECRET",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("siteUrl", () => {
  it("defaults to the canonical domain", () => {
    expect(siteUrl()).toBe("https://crawler.today");
  });

  it("uses the configured url without a trailing slash", () => {
    process.env["PUBLIC_SITE_URL"] = "https://staging.example/";
    expect(siteUrl()).toBe("https://staging.example");
  });

  it("ignores a blank value", () => {
    process.env["PUBLIC_SITE_URL"] = "   ";
    expect(siteUrl()).toBe("https://crawler.today");
  });
});

describe("paymentsEnvironment", () => {
  it("honours an explicit PADDLE_ENV", () => {
    process.env["PADDLE_ENV"] = "live";
    expect(paymentsEnvironment()).toBe("live");
    process.env["PADDLE_ENV"] = "sandbox";
    process.env["PADDLE_LIVE_API_KEY"] = "key";
    expect(paymentsEnvironment()).toBe("sandbox");
  });

  it("ignores an unknown PADDLE_ENV and falls back to sandbox", () => {
    process.env["PADDLE_ENV"] = "staging";
    expect(paymentsEnvironment()).toBe("sandbox");
  });

  it("goes live only for a production deployment with a live key", () => {
    process.env["PADDLE_LIVE_API_KEY"] = "key";
    expect(paymentsEnvironment()).toBe("live");
    process.env["PADDLE_SANDBOX_API_KEY"] = "sandbox-key";
    expect(paymentsEnvironment()).toBe("sandbox");
    process.env["NODE_ENV"] = "production";
    expect(paymentsEnvironment()).toBe("live");
  });
});

describe("paymentsConfigured / betaFree / releaseVersion", () => {
  it("stays in demo mode without credentials", () => {
    expect(paymentsConfigured()).toBe(false);
    expect(betaFree()).toBe(true);
    expect(releaseVersion()).toBe("0.0.1");
  });

  it("needs both a key and a webhook secret", () => {
    process.env["PADDLE_SANDBOX_API_KEY"] = "key";
    expect(paymentsConfigured()).toBe(false);
    process.env["PAYMENTS_SANDBOX_WEBHOOK_SECRET"] = "secret";
    expect(paymentsConfigured()).toBe(true);
    expect(betaFree()).toBe(false);
    expect(releaseVersion()).toBe("0.0.2");
  });

  it("accepts the legacy secret names and a generic api key", () => {
    process.env["PADDLE_API_KEY"] = "key";
    process.env["PADDLE_SANDBOX_WEBHOOK_SECRET"] = "secret";
    expect(paymentsConfigured()).toBe(true);

    delete process.env["PADDLE_SANDBOX_WEBHOOK_SECRET"];
    process.env["PADDLE_WEBHOOK_SECRET"] = "secret";
    expect(paymentsConfigured()).toBe(true);
  });

  it("checks the secret of the environment it actually charges in", () => {
    process.env["PADDLE_ENV"] = "live";
    process.env["PADDLE_LIVE_API_KEY"] = "key";
    process.env["PAYMENTS_SANDBOX_WEBHOOK_SECRET"] = "sandbox-secret";
    expect(paymentsConfigured()).toBe(false);
    process.env["PAYMENTS_LIVE_WEBHOOK_SECRET"] = "live-secret";
    expect(paymentsConfigured()).toBe(true);
  });
});
