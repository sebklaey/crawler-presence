/**
 * Team access, report settings and team sign-in — all capability-based.
 *
 * Owner actions require the recovery code. Team members use their own team
 * code, which grants only what their role allows and never exposes billing,
 * the owner secret or the team list.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { ManageAnalytics } from "./manage-analytics";
import type { ReportFrequency } from "./reports.server";
import type { TeamMember, TeamRole } from "./mcp/team.server";

const codeSchema = z.object({ code: z.string().trim().min(10).max(200) });

export type TeamFailure = { ok: false; reason: string };

/** Business is the plan that includes shared team access. */
const TEAM_PLANS = ["business"];

async function resolveOwner(code: string) {
  const { parseRecoveryCode, verifyManageSecret, allowRequest, PresenceStoreError } = await import(
    "./mcp/presences"
  );
  const parsed = parseRecoveryCode(code);
  if (!parsed) return { error: "invalid-code" as const };
  try {
    if (!(await allowRequest(`team:${parsed.slug}`, 20))) return { error: "rate-limited" as const };
    const presence = await verifyManageSecret(parsed.slug, parsed.secret);
    if (!presence) return { error: "not-found" as const };
    return { presence, slug: parsed.slug };
  } catch (error) {
    if (error instanceof PresenceStoreError) return { error: "unavailable" as const };
    throw error;
  }
}

export type TeamState = {
  ok: true;
  allowedOnPlan: boolean;
  members: TeamMember[];
  reports: { email: string | null; frequency: ReportFrequency; lastSentAt: string | null; deliveryReady: boolean };
};

export const teamOverviewFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => codeSchema.parse(input))
  .handler(async ({ data }): Promise<TeamState | TeamFailure> => {
    const resolved = await resolveOwner(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const allowed = TEAM_PLANS.includes(resolved.presence.plan);

    const { getReportSettings } = await import("./reports.server");
    const { emailConfigured } = await import("./email.server");
    const { PresenceStoreError } = await import("./mcp/presences");

    try {
      const { listTeam } = await import("./mcp/team.server");
      const [members, reports] = await Promise.all([
        allowed ? listTeam(resolved.slug) : Promise.resolve([]),
        getReportSettings(resolved.slug),
      ]);
      return { ok: true, allowedOnPlan: allowed, members, reports: { ...reports, deliveryReady: emailConfigured() } };
    } catch (error) {
      if (error instanceof PresenceStoreError) return { ok: false, reason: "unavailable" };
      throw error;
    }
  });

const inviteSchema = codeSchema.extend({
  label: z.string().trim().min(1).max(80),
  role: z.enum(["viewer", "editor"]),
});

export const teamInviteFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inviteSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; member: TeamMember; code: string } | TeamFailure> => {
    const resolved = await resolveOwner(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    if (!TEAM_PLANS.includes(resolved.presence.plan)) return { ok: false, reason: "plan" };

    const { PresenceStoreError } = await import("./mcp/presences");
    try {
      const { addTeamMember, listTeam } = await import("./mcp/team.server");
      const existing = await listTeam(resolved.slug);
      if (existing.length >= 20) return { ok: false, reason: "limit" };
      const created = await addTeamMember(resolved.slug, data.label, data.role as TeamRole);
      return { ok: true, member: created.member, code: created.code };
    } catch (error) {
      if (error instanceof PresenceStoreError) return { ok: false, reason: "unavailable" };
      throw error;
    }
  });

const revokeSchema = codeSchema.extend({ memberId: z.string().uuid() });

export const teamRevokeFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => revokeSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true } | TeamFailure> => {
    const resolved = await resolveOwner(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const { PresenceStoreError } = await import("./mcp/presences");
    try {
      const { revokeTeamMember } = await import("./mcp/team.server");
      await revokeTeamMember(resolved.slug, data.memberId);
      return { ok: true };
    } catch (error) {
      if (error instanceof PresenceStoreError) return { ok: false, reason: "unavailable" };
      throw error;
    }
  });

const reportSchema = codeSchema.extend({
  email: z.string().trim().max(200),
  frequency: z.enum(["off", "weekly", "monthly"]),
});

export const teamSetReportsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => reportSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true } | TeamFailure> => {
    const resolved = await resolveOwner(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };

    const { EMAIL_REGEX } = await import("./email.server");
    const email = data.email.trim();
    if (email && !EMAIL_REGEX.test(email)) return { ok: false, reason: "invalid-email" };

    const { PresenceStoreError } = await import("./mcp/presences");
    try {
      const { setReportSettings } = await import("./reports.server");
      await setReportSettings(resolved.slug, { email: email || null, frequency: data.frequency });
      return { ok: true };
    } catch (error) {
      if (error instanceof PresenceStoreError) return { ok: false, reason: "unavailable" };
      throw error;
    }
  });

/** Sends the report immediately, so the user can see exactly what arrives. */
export const teamSendReportNowFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => codeSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string; preview?: string }> => {
    const resolved = await resolveOwner(data.code);
    if ("error" in resolved) return { ok: false, reason: resolved.error };

    const { getReportSettings, buildReport, sendReport } = await import("./reports.server");
    const settings = await getReportSettings(resolved.slug);
    if (!settings.email) return { ok: false, reason: "no-recipient" };

    const days = settings.frequency === "monthly" ? 30 : 7;
    const result = await sendReport(resolved.slug, days, settings.email);
    if (result.delivered) return { ok: true };
    const report = await buildReport(resolved.slug, days);
    return { ok: false, reason: result.reason ?? "not-delivered", preview: report?.text ?? "" };
  });

/* ------------------------------------------------------------------ */
/* Team member sign-in (team code, no account)                         */
/* ------------------------------------------------------------------ */

export type TeamSession =
  | { ok: false; reason: string }
  | {
      ok: true;
      slug: string;
      name: string;
      label: string;
      role: TeamRole;
      status: "live" | "offline";
      plan: string;
      paths: string[];
      analytics: ManageAnalytics | null;
    };

export const teamSignInFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => codeSchema.parse(input))
  .handler(async ({ data }): Promise<TeamSession> => {
    const { PresenceStoreError, getPublished, allowRequest } = await import("./mcp/presences");
    const { parseTeamCode, verifyTeamCode } = await import("./mcp/team.server");

    const parsed = parseTeamCode(data.code);
    if (!parsed) return { ok: false, reason: "invalid-code" };
    try {
      if (!(await allowRequest(`teamlogin:${parsed.slug}`, 20))) return { ok: false, reason: "rate-limited" };
      const member = await verifyTeamCode(data.code);
      if (!member) return { ok: false, reason: "not-found" };

      const presence = await getPublished(member.slug);
      if (!presence) return { ok: false, reason: "not-found" };

      // Team members see the same measured numbers as the owner.
      const { analyticsFor } = await import("./manage-analytics");
      return {
        ok: true,
        slug: presence.slug,
        name: presence.core?.name || presence.slug,
        label: member.label,
        role: member.role,
        status: presence.status,
        plan: presence.plan,
        paths: presence.files.map((f) => f.path),
        analytics: await analyticsFor(presence.slug, presence.plan),
      };
    } catch (error) {
      if (error instanceof PresenceStoreError) return { ok: false, reason: "unavailable" };
      throw error;
    }
  });

const teamStatusSchema = codeSchema.extend({ status: z.enum(["live", "offline"]) });

/** Only an "editor" team code may change the public status. */
export const teamSetStatusFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => teamStatusSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string; status?: "live" | "offline" }> => {
    const { PresenceStoreError, setPresenceStatus } = await import("./mcp/presences");
    try {
      const { verifyTeamCode } = await import("./mcp/team.server");
      const member = await verifyTeamCode(data.code);
      if (!member) return { ok: false, reason: "not-found" };
      if (member.role !== "editor") return { ok: false, reason: "role" };
      await setPresenceStatus(member.slug, data.status);
      return { ok: true, status: data.status };
    } catch (error) {
      if (error instanceof PresenceStoreError) return { ok: false, reason: "unavailable" };
      throw error;
    }
  });
