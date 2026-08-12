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
    const { recordFunnel } = await import("./funnel.server");
    await recordFunnel(data);
    return { ok: true };
  });

const reportSchema = z.object({ days: z.number().int().min(1).max(180).default(30) });

/** Internal conversion report: distinct sessions and drop-off per step. */
export const funnelReportFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => reportSchema.parse(input))
  .handler(async ({ data }): Promise<FunnelReport> => {
    const { funnelReport } = await import("./funnel.server");
    return funnelReport(data.days);
  });
