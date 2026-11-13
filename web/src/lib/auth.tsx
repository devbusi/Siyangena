import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Me, Role } from "@drop/shared";
import { api } from "./api";
import { MOCK } from "./config";
import { mockAuth } from "./mock";
import { supabase } from "./supabase";

interface AuthState {
  ready: boolean; // the first session check is done
  signedIn: boolean;
  me: Me | null;
  refresh: () => Promise<Me | null>;
  signUp: (p: { email: string; password: string; fullName: string; phone: string; role: Exclude<Role, "admin"> }) => Promise<{ needsConfirm: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.me();
      setMe(next);
      return next;
    } catch {
      setMe(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (MOCK) {
      const sync = () => {
        const u = mockAuth.user();
        setSignedIn(Boolean(u));
        if (u) refresh().finally(() => setReady(true));
        else {
          setMe(null);
          setReady(true);
        }
      };
      sync();
      return mockAuth.onChange(sync);
    }
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      setSignedIn(Boolean(data.session));
      if (data.session) await refresh();
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      if (session) refresh();
      else setMe(null);
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      signedIn,
      me,
      refresh,
      async signUp({ email, password, fullName, phone, role }) {
        if (MOCK) {
          mockAuth.signIn(email, fullName, role, phone);
          return { needsConfirm: false };
        }
        if (!supabase) throw new Error("Sign-up isn't set up yet: the Supabase keys are missing");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, phone, role } },
        });
        if (error) throw new Error(error.message);
        return { needsConfirm: !data.session };
      },
      async signIn(email, password) {
        if (MOCK) {
          mockAuth.signIn(email);
          return;
        }
        if (!supabase) throw new Error("Sign-in isn't set up yet: the Supabase keys are missing");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "That email and password don't match" : error.message);
      },
      async signOut() {
        if (MOCK) mockAuth.signOut();
        else await supabase?.auth.signOut();
        setMe(null);
      },
    }),
    [ready, signedIn, me, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
