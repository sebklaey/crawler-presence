/**
 * Scheduled hard-deletion job for all room data.
 *
 * Enforces the two irrevocable limits in every room: nothing survives longer
 * than 24 hours, and only the newest 7 texts / 3 images are kept. Image bytes
 * are removed from private storage as well, so deletion is final.
 *
 * Protected by REPORTS_CRON_SECRET (header `x-cron-secret`).
 */
import { createFileRoute } from "@tanstack/react-router";

import { sweepImages } from "@/lib/room/imagestore";
import { getDb } from "@/lib/room/store";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/room-retention")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["REPORTS_CRON_SECRET"];
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!secret || !timingSafeEqual(secret, provided)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const db = await getDb();
        const { data: cleanup } = await db.rpc("cleanup_expired");
        const images = await sweepImages(db);

        return Response.json(
          { ok: true, cleanup, images, ran_at: new Date().toISOString() },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
