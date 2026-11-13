import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Drop, DropEvent } from "@drop/shared";
import { api } from "./api";

export type Persona = "thandi" | "sipho" | "promoter";

interface AppState {
  persona: Persona;
  setPersona: (p: Persona) => void;
  fanId: string;
  events: DropEvent[];
  drop: Drop | null;
  refreshDrop: () => Promise<void>;
  tick: number;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [persona, setPersona] = useState<Persona>(() => (localStorageGet("persona") as Persona) || "thandi");
  const [events, setEvents] = useState<DropEvent[]>([]);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [tick, setTick] = useState(0);

  const refreshDrop = useCallback(async () => {
    try {
      setDrop(await api.getDrop());
    } catch {
      setDrop(null);
    }
  }, []);

  useEffect(() => {
    refreshDrop();
    // One stream for the whole app. Every event also nudges screens to refetch.
    return api.subscribe((event) => {
      setEvents((prev) => [...prev.slice(-199), event]);
      setTick((t) => t + 1);
      refreshDrop();
    });
  }, [refreshDrop]);

  const value = useMemo<AppState>(
    () => ({
      persona,
      setPersona: (p) => {
        localStorageSet("persona", p);
        setPersona(p);
      },
      fanId: persona === "promoter" ? "thandi" : persona,
      events,
      drop,
      refreshDrop,
      tick,
    }),
    [persona, events, drop, refreshDrop, tick],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}

// Storage can be missing or blocked (private mode, embedded previews): never let it break the app.
function localStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(`siyangena.${key}`);
  } catch {
    return null;
  }
}
function localStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(`siyangena.${key}`, value);
  } catch {
    /* ignore */
  }
}
