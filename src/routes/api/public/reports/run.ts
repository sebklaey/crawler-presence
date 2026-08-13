import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "@/lib/secure-compare";

/**
 * Scheduled report delivery. Public route with a shared-secret guard, so an
 * external scheduler can call it. Without a configured secret the endpoint
 * refuses to run rather than being open to anyone.
 */
export const Route = createFileRoute("/api/public/reports/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
        const secret = env?.["REPORTS_CRON_SECRET"]?.trim();
        if (!secret) {
          return Response.json({ error: "Report scheduling is not configured." }, { status: 503 });
        }

        const provided =
          request.headers.get("x-crawler-cron-secret")?.trim() ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
          "";
        if (!timingSafeEqual(provided, secret)) return new Response("Unauthorized", { status: 401 });

        try {
          const { runDueReports } = await import("@/lib/reports.server");
          const { notifyTicketUpdates } = await import("@/lib/support-notify.server");
          const result = await runDueReports();
          // Same schedule announces support ticket status changes, so no
          // second scheduler is needed.
          const tickets = await notifyTicketUpdates();
          // Source monitoring, health scoring and lifecycle notifications run
          // on the same schedule; each step is independently idempotent.
          const { runRetentionMaintenance } = await import("@/lib/retention-jobs.server");
          const retention = await runRetentionMaintenance();
          return Response.json({ ok: true, ...result, ticketNotifications: tickets, retention });
        } catch (error) {
          console.error("[crawler] report run failed", error instanceof Error ? error.message : "unknown error");
          return Response.json({ ok: false, error: "Report run failed." }, { status: 500 });
        }

      },
    },
  },
});
