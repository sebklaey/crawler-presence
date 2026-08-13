import { useCallback, useEffect, useRef, useState } from "react";

import { loadDraft } from "@/lib/presence.functions";
import { isCoreEmpty, type KnowledgeCore } from "@/lib/knowledge";
import { useCore } from "@/lib/store";

export const LAST_SESSION_KEY = "crawler:last-session";

/** Order-independent signature of a Knowledge Core. */
function signature(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(signature).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${signature(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function tokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const t = new URLSearchParams(window.location.search).get("session");
  return t && t.trim() ? t.trim() : null;
}

export function rememberSessionToken(token: string) {
  try {
    localStorage.setItem(LAST_SESSION_KEY, token);
  } catch {
    /* ignore */
  }
}

export function readSessionToken(): string | null {
  const fromUrl = tokenFromUrl();
  if (fromUrl) {
    rememberSessionToken(fromUrl);
    return fromUrl;
  }
  try {
    return localStorage.getItem(LAST_SESSION_KEY);
  } catch {
    return null;
  }
}

/**
 * Keeps the local Knowledge Core in sync with the remote ChatGPT/MCP draft.
 *
 * The remote draft is the source of truth while an interview is running: any
 * change there is adopted, even when it does not raise the presence score
 * (rewrites, corrections, removed items). The local draft is only kept when
 * the remote session is empty or unchanged since the last adoption.
 */
export function useSessionSync(options?: { intervalMs?: number }) {
  const [core, setCore] = useCore();
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const coreRef = useRef(core);
  coreRef.current = core;
  const lastRemote = useRef<string | null>(null);

  const sync = useCallback(
    async (opts?: { silent?: boolean }): Promise<"updated" | "unchanged" | "no-session" | "expired" | "error"> => {
      const token = readSessionToken();
      if (!token) return "no-session";
      setSyncing(true);
      try {
        const result = await loadDraft({ data: { token } });
        if (!result.found) return "expired";
        const remote = result.core as KnowledgeCore;
        setLastSyncedAt(Date.now());
        if (isCoreEmpty(remote)) return "unchanged";
        const sig = signature(remote);
        if (sig === signature(coreRef.current)) {
          lastRemote.current = sig;
          return "unchanged";
        }
        // Remote changed since the last time we adopted it → always take it.
        if (lastRemote.current !== sig) {
          lastRemote.current = sig;
          setCore(remote);
          return "updated";
        }
        return "unchanged";
      } catch {
        return "error";
      } finally {
        setSyncing(false);
      }
    },
    [setCore],
  );

  useEffect(() => {
    void sync({ silent: true });
    const onFocus = () => {
      if (document.visibilityState === "visible") void sync({ silent: true });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = window.setInterval(() => void sync({ silent: true }), options?.intervalMs ?? 15000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { syncing, lastSyncedAt, sync };
}
