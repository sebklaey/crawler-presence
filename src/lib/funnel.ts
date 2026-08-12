import { useCallback, useEffect, useRef } from "react";

import { trackFunnelFn } from "./funnel.functions";
import type { FunnelEvent } from "./funnel.server";

const SESSION_KEY = "crawler.funnel.v1";

/** Anonymous, local-only funnel id. Never contains personal data. */
export function funnelSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const id = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return "";
  }
}

type Extra = {
  plan?: "plus" | "pro" | "business";
  presenceSlug?: string;
  fromStep?: string;
  toStep?: string;
  errorCategory?: string;
};

/** Fire-and-forget funnel event. Failures never surface to the user. */
export function trackFunnel(event: FunnelEvent, extra: Extra = {}): void {
  const sessionId = funnelSessionId();
  if (!sessionId) return;
  void trackFunnelFn({ data: { event, sessionId, ...extra } }).catch(() => undefined);
}

/** Records an event once per mount (e.g. `pricing_viewed`). */
export function useFunnelOnce(event: FunnelEvent, extra: Extra = {}, enabled = true) {
  const sent = useRef(false);
  const payload = JSON.stringify(extra);
  useEffect(() => {
    if (!enabled || sent.current) return;
    sent.current = true;
    trackFunnel(event, JSON.parse(payload) as Extra);
  }, [event, payload, enabled]);
}

export function useFunnel() {
  return useCallback((event: FunnelEvent, extra: Extra = {}) => trackFunnel(event, extra), []);
}
