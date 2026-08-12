import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { planById } from "../../billing";
import { asPlanId } from "../../entitlements";
import { allowRequest, getPublished, parseRecoveryCode, verifyManageSecret } from "../presences";
import { getSession } from "../sessions";

const NOT_MEASURABLE =
  "Crawler cannot see private conversations inside ChatGPT, Claude, Gemini, Perplexity or any other external assistant, and it never receives the conversation itself — only the arguments a Crawler tool call passes to it. Only Crawler-internal events and observable reads of the published files are measurable.";

const METRIC_DEFINITIONS = {
  conversations_mentioning: "Distinct anonymous Crawler sessions whose tool input referenced this Presence.",
  mention_events: "Individual Crawler tool calls that referenced this Presence.",
  crawler_reads: "Observable reads of the published Presence files (llms.txt, markdown, JSON).",
};

const periodSchema = z
  .union([z.literal(7), z.literal(30), z.literal(90), z.literal("all")])
  .default(30);

/** Plan windows: Plus 7 days, Pro 90 days, Business unlimited. */
function clampPeriod(period: 7 | 30 | 90 | "all", plan: string): 7 | 30 | 90 | "all" {
  const allowed = planById(asPlanId(plan)).analyticsDays;
  if (allowed >= 3650) return period;
  if (period === "all") return allowed >= 90 ? 90 : 7;
  return (Math.min(period, allowed) as 7 | 30 | 90);
}

export default defineTool({
  name: "get_analytics",
  title: "Presence analytics (Crawler-measured)",
  description:
    "Use this whenever a user asks how often something or someone was talked about inside Crawler, e.g. 'wie oft wurde über sebklaey.app geredet?', 'how many people asked about Product X?' or 'analytics last 7 days'. Pass entity_or_domain with the domain, URL, entity name or public Presence slug. It returns a truthful PUBLIC aggregate for any published Presence with no account and no code: distinct anonymous Crawler sessions that mentioned it, mention events, public file reads. Scope is Crawler-only — it measures Crawler tool calls and reads of the published Presence files, never all ChatGPT, Claude, Gemini or internet conversations. Detailed analytics (daily trend, file reads, sources, outbound clicks) require the Presence recovery code; pass it as recovery_code.",
  inputSchema: {
    entity_or_domain: z
      .string()
      .trim()
      .min(2)
      .max(200)
      .optional()
      .describe("Domain, URL, entity name or public Presence slug to look up, e.g. 'sebklaey.app'."),
    period_days: periodSchema.describe("Analytics window: 7, 30, 90 or 'all'."),
    recovery_code: z
      .string()
      .trim()
      .min(10)
      .max(200)
      .optional()
      .describe("Optional Presence recovery code (<slug>~crw_...) that unlocks detailed analytics."),
    session_id: z.string().trim().min(6).optional().describe("Optional Crawler session for session-local metrics."),
    filter: z.string().trim().optional().describe("Optional product or entity name filter."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ entity_or_domain, period_days, recovery_code, session_id, filter }) => {
    const period = (period_days ?? 30) as 7 | 30 | 90 | "all";

    // Reading analytics never records a mention: counts stay stable.
    if (!(await allowRequest("tool:get_analytics", 60))) {
      return {
        content: [{ type: "text" as const, text: "Rate limited: too many analytics requests in the last minute." }],
        structuredContent: { error: "rate_limited" },
        isError: true as const,
      };
    }

    const analytics = await import("../presence-analytics");

    /* -------- capability path: recovery code unlocks detail -------- */
    let authorizedSlug: string | null = null;
    if (recovery_code) {
      const parsed = parseRecoveryCode(recovery_code);
      const limited = !(await allowRequest(`analytics-code:${parsed?.slug ?? "invalid"}`, 10));
      if (limited) {
        return {
          content: [{ type: "text" as const, text: "Rate limited: too many recovery-code attempts." }],
          structuredContent: { error: "rate_limited" },
          isError: true as const,
        };
      }
      if (parsed) {
        const presence = await verifyManageSecret(parsed.slug, parsed.secret);
        if (presence) authorizedSlug = presence.slug;
      }
      if (!authorizedSlug) {
        return {
          content: [
            { type: "text" as const, text: "Unauthorized: that recovery code does not unlock detailed analytics." },
          ],
          structuredContent: { error: "unauthorized", detailed_summary: null },
          isError: true as const,
        };
      }
    }

    const lookup = entity_or_domain ?? (authorizedSlug ?? undefined);

    /* -------- public aggregate (free, no account, no code) -------- */
    if (lookup) {
      const slug = authorizedSlug ?? (await analytics.resolvePresenceSlug(lookup));
      if (!slug) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Crawler has no published Presence for "${lookup}", so there is nothing measured for it.`,
            },
          ],
          structuredContent: {
            found: false,
            entity_or_domain: lookup,
            measurement_scope: "crawler_only",
            not_measurable: NOT_MEASURABLE,
          },
        };
      }

      const presence = await getPublished(slug);
      const effectivePeriod = clampPeriod(period, presence?.plan ?? "plus");
      const summary = await analytics.publicSummary(slug, lookup, effectivePeriod);
      if (!summary) {
        return {
          content: [{ type: "text" as const, text: "Analytics are temporarily unavailable. Nothing was changed." }],
          structuredContent: { error: "unavailable" },
          isError: true as const,
        };
      }

      const windowLabel = effectivePeriod === "all" ? "gesamten Zeitraum" : `letzten ${effectivePeriod} Tagen`;
      const text = `${summary.conversations_mentioning} anonyme Crawler-Gespräche erwähnten ${lookup} im ${windowLabel} (${summary.mention_events} Erwähnungs-Events, ${summary.crawler_reads} öffentliche Presence-Reads). Gemessen ausschließlich innerhalb von Crawler — das ist keine Auswertung aller ChatGPT-, Claude-, Gemini- oder Internet-Gespräche.`;

      const detailed = authorizedSlug ? await analytics.detailedSummary(slug, effectivePeriod) : null;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: {
          found: true,
          public_summary: summary,
          detailed_summary: detailed,
          detail_available: Boolean(detailed),
          detail_hint: detailed ? null : "Detailed analytics require the Presence recovery code (recovery_code).",
          metric_definitions: METRIC_DEFINITIONS,
          not_measurable: NOT_MEASURABLE,
        },
      };
    }

    /* -------- no lookup: nothing to measure -------- */
    const session = session_id ? await getSession(session_id) : undefined;

    return {
      content: [
        {
          type: "text" as const,
          text: "No entity_or_domain was given, so there is nothing to measure. Crawler only reports data it actually observed for a published Presence — ask again with a domain, URL, entity name or Presence slug, e.g. entity_or_domain: \"sebklaey.app\".",
        },
      ],
      structuredContent: {
        data_mode: "measured_only",
        found: false,
        hint: "Pass entity_or_domain to get the measured public aggregate of a published Presence. Crawler serves no demo or seeded analytics.",
        period_days: period === "all" ? "all" : period,
        filter: filter ?? null,
        metric_definitions: METRIC_DEFINITIONS,
        not_measurable: NOT_MEASURABLE,
        session_local: session
          ? {
              session_id: session.id,
              interview_turns: session.transcript.length,
              knowledge_core_gaps: session.core.gaps,
              confidence: session.confidence,
            }
          : null,
      },
    };
  },
});
