/**
 * Paddle.js in the browser.
 *
 * The environment and the token always come from the server
 * (`paymentsStatusFn`), so the overlay can never run in a different
 * environment than the transaction that was created server-side.
 */
declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (environment: "sandbox" | "production") => void };
      Initialize: (options: { token: string; eventCallback?: (event: { name?: string }) => void }) => void;
      Checkout: {
        open: (options: {
          transactionId?: string;
          settings?: Record<string, unknown>;
        }) => void;
      };
    };
  }
}

let loading: Promise<NonNullable<Window["Paddle"]>> | null = null;
let initializedFor: string | null = null;

function injectScript(): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>('script[data-crawler-paddle="true"]');
  if (existing && window.Paddle) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Paddle.js failed to load")), { once: true });
    if (!existing) {
      script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      script.async = true;
      script.dataset["crawlerPaddle"] = "true";
      document.head.appendChild(script);
    }
  });
}

export async function loadPaddle(
  environment: "sandbox" | "live",
  token: string,
): Promise<NonNullable<Window["Paddle"]>> {
  if (!token) throw new Error("Checkout is not configured on this deployment.");
  const key = `${environment}:${token}`;
  if (initializedFor === key && window.Paddle) return window.Paddle;
  if (!loading) {
    loading = (async () => {
      await injectScript();
      const paddle = window.Paddle;
      if (!paddle) throw new Error("Paddle.js is unavailable.");
      paddle.Environment.set(environment === "sandbox" ? "sandbox" : "production");
      paddle.Initialize({ token });
      initializedFor = key;
      return paddle;
    })().catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

/** Opens the hosted overlay for a transaction created by the server. */
export async function openPaddleCheckout(input: {
  environment: "sandbox" | "live";
  token: string;
  transactionId: string;
  successUrl: string;
}): Promise<void> {
  const paddle = await loadPaddle(input.environment, input.token);
  paddle.Checkout.open({
    transactionId: input.transactionId,
    settings: {
      displayMode: "overlay",
      variant: "one-page",
      allowLogout: false,
      successUrl: input.successUrl,
    },
  });
}
