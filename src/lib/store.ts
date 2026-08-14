import { useCallback, useEffect, useRef, useState } from "react";
import { emptyCore, type KnowledgeCore } from "./knowledge";

const CORE_KEY = "crawler.core.v1";
const CHAT_KEY = "crawler.chat.v1";
const PLAN_KEY = "crawler.plan.v1";
const PUBLISH_KEY = "crawler.published.v1";
const CODE_KEY = "crawler.code.v1";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
};

export const uid = () => Math.random().toString(36).slice(2, 10);

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Cross-component listeners so every hook instance sees the same value. */
const listeners = new Map<string, Set<(v: unknown) => void>>();

function subscribe(key: string, fn: (v: unknown) => void) {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

function broadcast(key: string, value: unknown) {
  listeners.get(key)?.forEach((fn) => fn(value));
}

function useLocal<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setValue(read<T>(key, fallback));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const off = subscribe(key, (v) => setValue(v as T));
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setValue(read<T>(key, fallback));
    };
    window.addEventListener("storage", onStorage);
    return () => {
      off();
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const valueRef = useRef(value);
  valueRef.current = value;

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = read<T>(key, valueRef.current);
      const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        /* ignore quota errors */
      }
      setValue(resolved);
      broadcast(key, resolved);
    },
    [key],
  );


  return [value, update, hydrated] as const;
}


export const useCore = () => useLocal<KnowledgeCore>(CORE_KEY, emptyCore());
export const useChat = () => useLocal<ChatMessage[]>(CHAT_KEY, []);
export const usePlan = () => useLocal<"free" | "plus" | "pro" | "business">(PLAN_KEY, "free");
export const usePublished = () => useLocal<{ at: string; slug: string } | null>(PUBLISH_KEY, null);
/** Recovery code of the Presence currently opened on /manage (capability, not an account). */
export const useRecoveryCode = () => useLocal<string>(CODE_KEY, "");
export const readRecoveryCode = () => read<string>(CODE_KEY, "");

/* ---------------- Knowledge Core editor workspace ---------------- */

const KC_CHAT_KEY = "crawler.kc.chat.v1";
const KC_PROPOSALS_KEY = "crawler.kc.proposals.v1";
const KC_VERSIONS_KEY = "crawler.kc.versions.v1";

/** Chat transcript of the ChatGPT-powered Knowledge Core editor. */
export const useKcChat = () => useLocal<ChatMessage[]>(KC_CHAT_KEY, []);
/** Proposed changes waiting for the user's decision. */
export const useProposals = () => useLocal<import("./kc/model").Proposal[]>(KC_PROPOSALS_KEY, []);
/** Local version history with restore points. */
export const useVersions = () => useLocal<import("./kc/model").Version[]>(KC_VERSIONS_KEY, []);

