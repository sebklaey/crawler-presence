import { usePaymentsStatus } from "@/hooks/use-payments-status";

/** Renders nothing in live mode. Makes test/unconfigured payments unmistakable. */
export function PaymentTestModeBanner() {
  const { status, loading } = usePaymentsStatus();
  if (loading) return null;

  if (!status.configured) {
    return (
      <div className="border-b border-border bg-secondary px-4 py-2 text-center text-xs text-muted-foreground">
        <strong className="text-foreground">Free Beta 0.0.1.</strong> Publishing is free while live payments are not
        enabled yet. As soon as they are, Crawler switches automatically to the paid version 0.0.2.
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
