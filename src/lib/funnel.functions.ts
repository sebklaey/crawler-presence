import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { FUNNEL_EVENTS, type FunnelReport } from "./funnel.server";

const eventSchema = z.object({
  event: z.enum(FUNNEL_EVENTS),
  sessionId: z.string().trim().min(6).max(128),
  plan: z.enum(["plus", "pro", "business"]).optional(),
  presenceSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,120}$/)
    .optional(),
  fromStep: z.string().trim().max(48).optional(),
  toStep: z.string().trim().max(48).optional(),
  errorCategory: z.string().trim().max(48).optional(),
});

/** Records one privacy-minimised funnel event. Always resolves. */
export const trackFunnelFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => eventSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { allowRequest } = await import("./mcp/presences");
    // Unauthenticated writer: bounded so the funnel table cannot be flooded.
    if (!(await allowRequest(`funnel:${data.sessionId}`, 120))) return { ok: true };
    const { recordFunnel } = await import("./funnel.server");
    await recordFunnel(data);
    return { ok: true };
  });

const reportSchema = z.object({
  days: z.number().int().min(1).max(180).default(30),
  secret: z.string().min(1),
});

/**
 * Internal conversion report: distinct sessions and drop-off per step. This is
 * business data, so it requires FUNNEL_REPORT_SECRET and fails closed when the
 * secret is not configured.
 */
export const funnelReportFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => reportSchema.parse(input))
  .handler(async ({ data }): Promise<FunnelReport> => {
    const expected = process.env["FUNNEL_REPORT_SECRET"]?.trim();
    if (!expected) throw new Error("Funnel reporting is not configured.");
    const { timingSafeEqual } = await import("./secure-compare");
    if (!timingSafeEqual(data.secret, expected)) throw new Error("Unauthorized");
    const { funnelReport } = await import("./funnel.server");
    return funnelReport(data.days);
  });
