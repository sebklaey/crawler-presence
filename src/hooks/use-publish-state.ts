import { useQuery } from "@tanstack/react-query";

import { manageRestoreCoreFn } from "@/lib/manage.functions";
import { asPlanId } from "@/lib/entitlements";
import { planById } from "@/lib/billing";
import type { PlanId } from "@/lib/billing";
import { isCoreEmpty, type KnowledgeCore } from "@/lib/knowledge";
import { useCore, usePublished } from "@/lib/store";
import { useManageSession } from "./use-manage-session";

/** Order-independent comparison of two Knowledge Cores. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export type PublishState = {
  /** A published Presence is known in this browser and an open management session can manage it. */
  isLive: boolean;
  slug: string | null;
  plan: PlanId;
  /** Local Knowledge Core differs from what is published — an update is pending. */
  hasChanges: boolean;
  /** Local content exceeds the plan's content-record or document limit. */
  overLimit: boolean;
  limit: number;
  /** Local imported documents exceed the plan's document limit. */
  overDocumentLimit: boolean;
  documentLimit: number;
  documentCount: number;
  /** A verified HttpOnly management session is open — writes are allowed. */
  manageable: boolean;
  loading: boolean;
  refresh: () => void;
};

/**
 * Shared publish state: is this browser's Presence live, and is what is live
 * identical to the local Knowledge Core?
 */
export function usePublishState(): PublishState {
  const [core] = useCore();
  const [published] = usePublished();
  const session = useManageSession();

  // Authority is the HttpOnly cookie, never a capability held in the browser.
  const enabled = session.ready && session.active;
  const query = useQuery({
    queryKey: ["publish-state", session.slug ?? published?.slug ?? ""],
    enabled,
    staleTime: 30 * 1000,
    queryFn: () => manageRestoreCoreFn(),
  });

  const result = query.data;
  const ok = Boolean(result && "ok" in result && result.ok);
  const remote = ok ? ((result as { core: unknown }).core as KnowledgeCore) : null;
  const plan = asPlanId(ok ? (result as { plan?: string }).plan : undefined);
  const limit = planById(plan).catalogLimit;
  const documentLimit = planById(plan).documentLimit;
  const documentCount = core.documents?.length ?? 0;
  const overDocumentLimit = documentCount > documentLimit;

  const isLive = ok;
  const hasChanges = Boolean(isLive && remote && !isCoreEmpty(core) && stable(core) !== stable(remote));

  return {
    isLive,
    slug: ok ? ((result as { slug: string }).slug ?? null) : (session.slug ?? published?.slug ?? null),
    plan,
    hasChanges,
    overLimit: (core.items?.length ?? 0) > limit || overDocumentLimit,
    limit,
    overDocumentLimit,
    documentLimit,
    documentCount,
    manageable: enabled && ok,
    loading: (!session.ready || (enabled && query.isLoading)),
    refresh: () => void query.refetch(),
  };
}
