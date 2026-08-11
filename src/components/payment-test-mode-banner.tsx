const clientToken = import.meta.env["VITE_PAYMENTS_CLIENT_TOKEN"] as string | undefined;

/** Renders nothing in live mode. Makes test/unconfigured payments unmistakable. */
export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="border-b border-border bg-secondary px-4 py-2 text-center text-xs text-muted-foreground">
        <strong className="text-foreground">Demo / test mode.</strong> No payment credentials in this build — checkout
        is unavailable and publishing stays clearly labelled as a demo.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="border-b border-border bg-secondary px-4 py-2 text-center text-xs text-muted-foreground">
        <strong className="text-foreground">Test mode.</strong> Payments in this preview are test payments — no money
        moves. Use card 4242 4242 4242 4242.
      </div>
    );
  }
  return null;
}
