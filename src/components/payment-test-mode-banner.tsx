import { usePaymentsStatus } from "@/hooks/use-payments-status";

/** Renders nothing in live mode. Makes test/unconfigured payments unmistakable. */
export function PaymentTestModeBanner() {
  const { status, loading } = usePaymentsStatus();
  if (loading) return null;

  if (!status.configured) {
    return (
      <div className="border-b border-border bg-secondary px-4 py-2 text-center text-xs text-muted-foreground">
        <strong className="text-foreground">Demo / test mode.</strong> No payment credentials on this deployment —
        checkout is unavailable and publishing stays clearly labelled as a demo.
      </div>
    );
  }

  if (status.environment === "sandbox") {
    return (
      <div className="border-b border-border bg-secondary px-4 py-2 text-center text-xs text-muted-foreground">
        <strong className="text-foreground">Sandbox mode.</strong> Payments in this preview run against the payment
        provider&apos;s sandbox — no money moves.
      </div>
    );
  }

  return null;
}
