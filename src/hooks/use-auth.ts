import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
};

/** Session state for the header affordance and account screens. */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ loading: true, session: null, user: null });

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState({ loading: false, session, user: session?.user ?? null });
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState({ loading: false, session: data.session, user: data.session?.user ?? null });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/** Only same-origin relative paths may be used as a post-login destination. */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
