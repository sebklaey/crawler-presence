/**
 * Privacy-friendly funnel measurement.
 *
 * Stored per event: event type, an unlinkable hashed session id, an optional
 * presence slug, the chosen plan, the previous and next funnel step and a
 * coarse error category. Never stored: interview answers, management codes,
 * payment data, e-mail addresses, IP addresses or any private content.
 */
export const FUNNEL_EVENTS = [
  "interview_started",
  "interview_question_answered",
  "interview_abandoned",
  "knowledge_core_completed",
  "preview_opened",
  "files_previewed",
  "publish_clicked",
  "pricing_viewed",
  "plan_selected",
  "checkout_started",
  "checkout_abandoned",
  "payment_confirmed",
  "publish_started",
  "publish_completed",
  "publish_failed",
  "management_code_acknowledged",
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export type FunnelInput = {
  event: FunnelEvent;
  sessionId: string;
  plan?: string | undefined;
  presenceSlug?: string | undefined;
  fromStep?: string | undefined;
  toStep?: string | undefined;
  errorCategory?: string | undefined;
};

async function client() {
  try {
    const { db } = await import("./mcp/db.server");
    return db();
  } catch {
    return null;
  }
}

/** Records one funnel event. Measurement must never break the user flow. */
export async function recordFunnel(input: FunnelInput): Promise<void> {
  const supabase = await client();
  if (!supabase) return;
  try {
    const { sessionFingerprint } = await import("./mcp/presence-analytics");
    const sessionHash = await sessionFingerprint(`funnel:${input.sessionId}`);
    await supabase.from("funnel_events").insert({
      event_type: input.event,
      session_hash: sessionHash,
      presence_slug: input.presenceSlug ?? null,
      plan: input.plan ?? null,
      from_step: input.fromStep ?? null,
      to_step: input.toStep ?? null,
      error_category: input.errorCategory ?? null,
    });
  } catch {
    /* measurement is best-effort */
  }
}

/** The ordered steps the internal conversion report is built from. */
export const FUNNEL_STEPS: { key: FunnelEvent; label: string }[] = [
  { key: "interview_started", label: "Interview started" },
  { key: "knowledge_core_completed", label: "Knowledge Core completed" },
  { key: "preview_opened", label: "Preview opened" },
  { key: "pricing_viewed", label: "Pricing opened" },
  { key: "plan_selected", label: "Plan selected" },
  { key: "checkout_started", label: "Checkout started" },
  { key: "payment_confirmed", label: "Payment confirmed" },
  { key: "publish_completed", label: "Presence published" },
];

export type FunnelStepReport = {
  key: string;
  label: string;
  sessions: number;
  conversionFromPrevious: number | null;
  dropOffFromPrevious: number | null;
};

export type FunnelReport = {
  available: boolean;
  days: number;
  steps: FunnelStepReport[];
  total: number;
};

/** Distinct anonymous sessions per funnel step, plus step-to-step conversion. */
export async function funnelReport(days: number): Promise<FunnelReport> {
  const supabase = await client();
  const empty: FunnelReport = {
    available: false,
    days,
    total: 0,
    steps: FUNNEL_STEPS.map((s) => ({
      key: s.key,
      label: s.label,
      sessions: 0,
      conversionFromPrevious: null,
      dropOffFromPrevious: null,
    })),
  };
  if (!supabase) return empty;

  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("funnel_events")
    .select("event_type, session_hash")
    .gte("occurred_at", since)
    .limit(50_000);
  if (error || !data) return empty;

  const bySteps = new Map<string, Set<string>>();
  for (const row of data as { event_type: string; session_hash: string }[]) {
    const set = bySteps.get(row.event_type) ?? new Set<string>();
    set.add(row.session_hash);
    bySteps.set(row.event_type, set);
  }

  let previous: number | null = null;
  const steps = FUNNEL_STEPS.map((step) => {
    const sessions = bySteps.get(step.key)?.size ?? 0;
    const conversion = previous && previous > 0 ? Math.round((sessions / previous) * 100) : null;
    const report: FunnelStepReport = {
      key: step.key,
      label: step.label,
      sessions,
      conversionFromPrevious: conversion,
      dropOffFromPrevious: conversion === null ? null : Math.max(0, 100 - conversion),
    };
    previous = sessions;
    return report;
  });

  return { available: true, days, steps, total: new Set(data.map((r) => r.session_hash)).size };
}
