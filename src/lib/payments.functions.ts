import { createServerFn } from "@tanstack/react-start";

export type PaymentsStatus = {
  configured: boolean;
  environment: "sandbox" | "live";
  /** Free Beta 0.0.1 — publishing is free until live payments are enabled. */
  betaFree: boolean;
  version: "0.0.1" | "0.0.2";
};

/**
 * Whether this deployment can really charge. The browser cannot see server
 * secrets, so the UI asks here instead of guessing from a build-time variable.
 * While no live payment credentials exist, Crawler runs as Free Beta 0.0.1 and
 * publishing is free; as soon as they exist it switches to paid 0.0.2.
 */
export const paymentsStatusFn = createServerFn({ method: "GET" }).handler(async (): Promise<PaymentsStatus> => {
  const { paddleEnvironment, paymentsConfigured } = await import("./paddle.server");
  const environment = paddleEnvironment();
  const configured = paymentsConfigured(environment);
  return { configured, environment, betaFree: !configured, version: configured ? "0.0.2" : "0.0.1" };
});
