import { useEffect } from "react";

import { usePaymentsStatus } from "@/hooks/use-payments-status";
import { loadPaddle } from "@/lib/paddle-client";

/**
 * Paddle transaction links can return to `/?_ptxn=…`. Having Paddle.js
 * initialized (in the server-chosen environment) lets its script recognize
 * that parameter and reopen the secure overlay.
 */
export function PaymentCheckoutLoader() {
  const { status, loading } = usePaymentsStatus();

  useEffect(() => {
    if (loading || !status.configured || !status.clientToken) return;
    void loadPaddle(status.environment, status.clientToken).catch(() => {
      /* checkout is opened explicitly on /publish; silent here */
    });
  }, [loading, status.configured, status.clientToken, status.environment]);

  return null;
}
