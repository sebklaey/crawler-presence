/**
 * The one browser-side source of truth for "is a management session open?".
 *
 * The independent recovery code is exchanged exactly once for an HttpOnly,
 * Secure, SameSite=Strict cookie and is then dropped from memory. Everything
 * this hook exposes afterwards is non-secret: whether a session is active and
 * which slug it belongs to. Writes carry the CSRF token automatically
 * (attached by the client middleware in `src/start.ts`).
 */
import { useCallback, useEffect, useState } from "react";

import {
  closeManageSession,
  manageSessionActive,
  manageSessionSlug,
  openManageSession,
  type ManageSessionResult,
} from "@/lib/manage-session";

export type ManageSession = {
  /** Server-verified: the HttpOnly cookie is present and unexpired. */
  active: boolean;
  slug: string | null;
  /** false until the first server check answered — never assume access. */
  ready: boolean;
  open: (code: string) => Promise<ManageSessionResult>;
  close: () => Promise<void>;
  /** Call after any 401/unauthenticated answer to lock the UI again. */
  invalidate: () => void;
};

export function useManageSession(): ManageSession {
  const [state, setState] = useState<{ active: boolean; slug: string | null; ready: boolean }>({
    active: false,
    slug: null,
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await manageSessionActive();
      if (!cancelled) {
        setState({ active: result.active, slug: result.slug ?? manageSessionSlug(), ready: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const open = useCallback(async (code: string) => {
    const result = await openManageSession(code);
    setState({ active: result.ok, slug: result.ok ? result.slug : null, ready: true });
    return result;
  }, []);

  const close = useCallback(async () => {
    await closeManageSession();
    setState({ active: false, slug: null, ready: true });
  }, []);

  const invalidate = useCallback(() => {
    setState({ active: false, slug: null, ready: true });
    void closeManageSession();
  }, []);

  return { ...state, open, close, invalidate };
}
