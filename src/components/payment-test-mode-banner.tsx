import { usePaymentsStatus } from "@/hooks/use-payments-status";

/** Renders nothing in live mode. Makes test/unconfigured payments unmistakable. */
export function PaymentTestModeBanner() {
  const { status, loading } = usePaymentsStatus();
  if (loading) return null;

  if (!status.configured) {
    return (
      <div className="border-b border-border bg-secondary px-4 py-2 text-center text-xs text-muted-foreground">
        <strong className="text-foreground">Checkout temporarily unavailable.</strong> Crawler Alpha 0.0.2 is
        paid-only — building and previewing stay free, publishing resumes as soon as checkout is reachable again.
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
