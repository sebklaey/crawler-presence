import { createServerFn } from "@tanstack/react-start";

export type PaymentsStatus = { configured: boolean; environment: "sandbox" | "live" };

/**
 * Whether this deployment can really charge. The browser cannot see server
 * secrets, so the UI asks here instead of guessing from a build-time variable.
 */
export const paymentsStatusFn = createServerFn({ method: "GET" }).handler(async (): Promise<PaymentsStatus> => {
  const { paddleEnvironment, paymentsConfigured } = await import("./paddle.server");
  const environment = paddleEnvironment();
  return { configured: paymentsConfigured(environment), environment };
});
