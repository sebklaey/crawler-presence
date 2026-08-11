import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createCheckoutSession } from "@/lib/payments.functions";
import type { PlanId } from "@/lib/billing";

export function PresenceCheckout({
  plan,
  sessionToken,
  returnUrl,
}: {
  plan: PlanId;
  sessionToken?: string | undefined;
  returnUrl?: string | undefined;
}) {
  const fetchClientSecret = async (): Promise<string> => {
    const result = await createCheckoutSession({
      data: {
        plan,
        environment: getStripeEnvironment(),
        returnUrl: returnUrl || `${window.location.origin}/account`,
        ...(sessionToken ? { sessionToken } : {}),
      },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Checkout could not be started.");
    return result.clientSecret;
  };

  return (
    <div id="checkout" className="mt-5 overflow-hidden rounded-xl border border-border">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
