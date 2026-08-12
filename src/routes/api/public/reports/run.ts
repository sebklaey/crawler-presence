import { createFileRoute } from "@tanstack/react-router";

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
        if (provided !== secret) return new Response("Unauthorized", { status: 401 });

        try {
          const { runDueReports } = await import("@/lib/reports.server");
          const result = await runDueReports();
          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error("[crawler] report run failed", error instanceof Error ? error.message : "unknown error");
          return Response.json({ ok: false, error: "Report run failed." }, { status: 500 });
        }
      },
    },
  },
});
