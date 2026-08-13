import { useEffect } from "react";

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (environment: "sandbox" | "production") => void };
      Initialize: (options: { token: string }) => void;
    };
  }
}

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

/**
 * Paddle transaction links return to `/?_ptxn=…`. Initializing Paddle on every
 * route lets its script recognize that parameter and open the secure overlay.
 */
export function PaymentCheckoutLoader() {
  useEffect(() => {
    if (!clientToken || window.Paddle) return;

    const existing = document.querySelector<HTMLScriptElement>('script[data-crawler-paddle="true"]');
    const initialize = () => {
      if (!window.Paddle) return;
      window.Paddle.Environment.set(clientToken.startsWith("test_") ? "sandbox" : "production");
      window.Paddle.Initialize({ token: clientToken });
    };

    if (existing) {
      existing.addEventListener("load", initialize, { once: true });
      return () => existing.removeEventListener("load", initialize);
    }

    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.dataset.crawlerPaddle = "true";
    script.addEventListener("load", initialize, { once: true });
    document.head.appendChild(script);

    return () => script.removeEventListener("load", initialize);
  }, []);

  return null;
}