import { useQuery } from "@tanstack/react-query";

import { paymentsStatusFn, type PaymentsStatus } from "@/lib/payments.functions";

const FALLBACK: PaymentsStatus = { configured: false, environment: "sandbox" };

/** Server-verified payment mode: never claims live checkout without credentials. */
export function usePaymentsStatus(): { status: PaymentsStatus; loading: boolean } {
  const query = useQuery({
    queryKey: ["payments-status"],
    queryFn: () => paymentsStatusFn(),
    staleTime: 5 * 60 * 1000,
  });
  return { status: query.data ?? FALLBACK, loading: query.isLoading };
}
