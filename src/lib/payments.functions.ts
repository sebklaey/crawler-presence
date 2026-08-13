import { createServerFn } from "@tanstack/react-start";

export type PaymentsStatus = {
  configured: boolean;
  environment: "sandbox" | "live";
  /** Always false since Alpha 0.0.2 — the free beta has ended. */
  betaFree: boolean;
  version: "0.0.2";
};

/**
 * Whether this deployment can really charge. The browser cannot see server
 * secrets, so the UI asks here instead of guessing from a build-time variable.
 * Crawler Alpha 0.0.2 is paid-only: publishing always requires a subscription.
 * `configured` only says whether checkout can currently be started.
 */
export const paymentsStatusFn = createServerFn({ method: "GET" }).handler(async (): Promise<PaymentsStatus> => {
  const { paddleEnvironment, paymentsConfigured } = await import("./paddle.server");
  const environment = paddleEnvironment();
  const configured = paymentsConfigured(environment);
  return { configured, environment, betaFree: false, version: "0.0.2" };
});
