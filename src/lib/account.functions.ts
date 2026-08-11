/**
 * Account linking server functions.
 *
 * The MCP endpoint stays unauthenticated and anonymous. Ownership only ever
 * happens here, after a real Google sign-in on the website: the user claims a
 * draft token, which links the anonymous Knowledge Core to their account and
 * unlocks durable ownership, subscription-gated publishing, cross-device
 * recovery and private analytics.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const tokenSchema = z.object({ token: z.string().trim().min(6).max(128) });

export const claimDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { claimSession, getSession } = await import("./mcp/sessions");
    const result = await claimSession(data.token, context.userId);
    if (!result.ok) return { ok: false as const, reason: result.reason ?? "failed" };
    const session = await getSession(data.token);
    return {
      ok: true as const,
      core: session?.core ?? null,
      updated_at: session ? new Date(session.updatedAt).toISOString() : null,
    };
  });

export type AccountOverview = {
  drafts: { token: string; name: string; updated_at: string }[];
  presences: { slug: string; name: string; plan: string; mode: string; published_at: string }[];
};

export const getAccountOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountOverview> => {
    const { db } = await import("./mcp/db.server");
    const supabase = db();
    if (!supabase) return { drafts: [], presences: [] };

    const [{ data: drafts }, { data: presences }] = await Promise.all([
      supabase
        .from("mcp_sessions")
        .select("token, core, updated_at")
        .eq("owner_user_id", context.userId)
        .order("updated_at", { ascending: false })
        .limit(25),
      supabase
        .from("published_presences")
        .select("slug, core, plan, mode, created_at")
        .eq("owner_user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    return {
      drafts: ((drafts ?? []) as { token: string; core: { name?: string }; updated_at: string }[]).map((d) => ({
        token: d.token,
        name: d.core?.name || "Untitled draft",
        updated_at: d.updated_at,
      })),
      presences: (
        (presences ?? []) as {
          slug: string;
          core: { name?: string };
          plan: string;
          mode: string;
          created_at: string;
        }[]
      ).map((p) => ({
        slug: p.slug,
        name: p.core?.name || p.slug,
        plan: p.plan,
        mode: p.mode,
        published_at: p.created_at,
      })),
    };
  });
