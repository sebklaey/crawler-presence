import { createServerFn } from "@tanstack/react-start";

export type PaymentsStatus = {
  /** Checkout can be created AND confirmed right now. */
  configured: boolean;
  environment: "sandbox" | "live";
  /** Paddle.js token for exactly this environment — never guessed in the browser. */
  clientToken: string;
  /** Always false since Alpha 0.0.2 — the free beta has ended. */
  betaFree: boolean;
  version: "0.0.2";
};

/**
 * The browser never derives the payment environment itself: the server owns it
 * (see `payments-config.ts`) and hands down the matching Paddle.js token, so a
 * sandbox transaction can never be opened with a live token or vice versa.
 */
export const paymentsStatusFn = createServerFn({ method: "GET" }).handler(async (): Promise<PaymentsStatus> => {
  const { paymentsEnv, paymentsReady, paymentsClientToken } = await import("./payments-config");
  const environment = paymentsEnv();
  return {
    configured: paymentsReady(),
    environment,
    clientToken: paymentsClientToken(environment),
    betaFree: false,
    version: "0.0.2",
  };
});
