import { useCallback, useEffect, useState } from "react";
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

function useLocal<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setValue(read<T>(key, fallback));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* ignore quota errors */
        }
        return resolved;
      });
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
