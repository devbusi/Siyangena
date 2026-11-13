import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Drop, DropEvent } from "@drop/shared";
import { api } from "./api";

// Live feed and the list of events, shared by every screen.
interface AppState {
  events: DropEvent[];
  drops: Drop[];
  refreshDrops: () => Promise<void>;
  tick: number;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<DropEvent[]>([]);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [tick, setTick] = useState(0);

  const refreshDrops = useCallback(async () => {
    try {
      setDrops(await api.listEvents());
    } catch {
      /* keep the last list */
    }
  }, []);

  useEffect(() => {
    refreshDrops();
    // One stream for the whole app. Every event also nudges screens to refetch.
    return api.subscribe((event) => {
      setEvents((prev) => [...prev.slice(-299), event]);
      setTick((t) => t + 1);
      if (event.type.startsWith("drop.") || event.type === "sale.ticket_sent") refreshDrops();
    });
  }, [refreshDrops]);

  const value = useMemo<AppState>(() => ({ events, drops, refreshDrops, tick }), [events, drops, refreshDrops, tick]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}

export function useDrop(id: string | undefined): Drop | null {
  const { drops } = useApp();
  return drops.find((d) => d.id === id) ?? null;
}
