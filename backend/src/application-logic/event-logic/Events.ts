import { EventEmitter } from "events";
import type { DropEvent, DropEventType } from "@drop/shared";
import { state, save } from "../../lib/store";
import { nowIso } from "../../lib/utils/ids";
import { xrplExplorer } from "../../xrpl/xrpl.explorer";

// Event bus feeding the SSE stream at GET /api/events.
const bus = new EventEmitter();
bus.setMaxListeners(100);

export class Events {
  emit(type: DropEventType, message: string, extra: Partial<Omit<DropEvent, "type" | "message" | "at">> = {}) {
    const event: DropEvent = {
      type,
      at: nowIso(),
      message,
      ...extra,
      ...(extra.txHash && !extra.explorerUrl ? { explorerUrl: xrplExplorer.transactionUrl(extra.txHash) } : {}),
    };
    state.events.push(event);
    save();
    console.log(`[event] ${type}: ${message}${event.txHash ? ` (${event.txHash})` : ""}`);
    bus.emit("event", event);
    return event;
  }

  subscribe(listener: (event: DropEvent) => void): () => void {
    bus.on("event", listener);
    return () => bus.off("event", listener);
  }

  recent(limit = 50, eventId?: string): DropEvent[] {
    const list = eventId ? state.events.filter((e) => !e.eventId || e.eventId === eventId) : state.events;
    return list.slice(-limit);
  }
}
