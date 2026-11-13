import type { AlertItem, AlertKind, Demand, DropEvent, Wish } from "@drop/shared";
import { state, save, DropRecord, WishRecord } from "../../lib/store";
import { notFound } from "../../lib/utils/errors";
import { newId, nowIso } from "../../lib/utils/ids";
import { zar } from "../../lib/utils/money";
import { notify } from "../../lib/sms";
import { Events } from "../event-logic/Events";

const events = new Events();

// Words that say nothing about which event someone wants.
const STOP = new Set([
  "a", "an", "and", "at", "for", "in", "of", "on", "the", "to", "with", "my", "me", "near",
  "night", "nights", "live", "event", "events", "show", "shows", "party", "tickets", "ticket", "vibe", "vibes", "anywhere", "anything", "something", "everything", "whatever", "good", "fun",
]);

// How people say South African cities.
const CITY_ALIASES: Record<string, string> = {
  joburg: "johannesburg", jozi: "johannesburg", jhb: "johannesburg", egoli: "johannesburg",
  cpt: "cape town", kaapstad: "cape town", "the mother city": "cape town",
  dbn: "durban", ethekwini: "durban",
  pta: "pretoria", tshwane: "pretoria",
  pe: "gqeberha", "port elizabeth": "gqeberha",
  bloem: "bloemfontein", pmb: "pietermaritzburg", el: "east london",
};

function normCity(c?: string): string {
  const v = (c ?? "").trim().toLowerCase();
  if (!v || v === "anywhere" || v === "any") return "";
  return CITY_ALIASES[v] ?? v;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !CITY_ALIASES[w]);
}

type EventLike = { name: string; venue?: string; city?: string; scene?: string; promoterName?: string; priceZar?: number };

// Does this wish fit this event? Any meaningful word in common, the same city (if one was
// given) and a price at or under their max.
export function wishMatches(w: { query: string; city?: string; maxZar?: number }, d: EventLike): boolean {
  const city = normCity(w.city);
  const eventCity = normCity(d.city) || (d.venue ?? "").toLowerCase();
  if (city && !eventCity.includes(city)) return false;
  if (w.maxZar && d.priceZar !== undefined && d.priceZar > w.maxZar) return false;
  const wanted = words(w.query);
  // A wish that is only a city ("anything in Durban") matches every event there.
  if (wanted.length === 0) return Boolean(city);
  const hay = `${d.name} ${d.venue ?? ""} ${d.scene ?? ""} ${d.promoterName ?? ""}`.toLowerCase();
  return wanted.some((word) => hay.includes(word) || (word.length > 4 && hay.includes(word.slice(0, -1))));
}

// Rand for people: R1,200 rather than R1200.00.
export function randText(n: number | string): string {
  const v = Math.round(Number(n) || 0);
  return "R" + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const live = (d: DropRecord) => d.state === "scheduled" || d.state === "open";

export class Alerts {
  // ---- Alerts ----

  push(fanId: string, a: { kind: AlertKind; title: string; body: string; eventId?: string }, opts: { sms?: boolean } = {}) {
    const item: AlertItem = { id: newId("alert"), ...a, at: nowIso(), read: false };
    (state.alerts[fanId] ??= []).push(item);
    save();
    if (opts.sms !== false) notify(fanId, `Siyangena: ${a.title}. ${a.body}`);
    return item;
  }

  list(fanId: string): AlertItem[] {
    return [...(state.alerts[fanId] ?? [])].reverse();
  }

  markRead(fanId: string) {
    for (const a of state.alerts[fanId] ?? []) a.read = true;
    save();
  }

  // ---- Wishes ----

  private toWish(w: WishRecord): Wish {
    const found = Object.values(state.drops)
      .filter((d) => live(d) && wishMatches(w, d))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const matches = found.length;
    return {
      events: found.map((d) => ({
        id: d.id,
        name: d.name,
        venue: d.venue,
        ...(d.city ? { city: d.city } : {}),
        startsAt: d.startsAt,
        priceZar: zar(d.priceZar),
        state: d.state,
      })),
      id: w.id,
      query: w.query,
      ...(w.city ? { city: w.city } : {}),
      ...(w.maxZar ? { maxZar: zar(w.maxZar) } : {}),
      createdAt: w.createdAt,
      matches,
    };
  }

  wishes(fanId: string): Wish[] {
    return Object.values(state.wishes)
      .filter((w) => w.fanId === fanId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((w) => this.toWish(w));
  }

  addWish(fanId: string, input: { query: string; city?: string; maxZar?: number }): Wish {
    const record: WishRecord = {
      id: newId("wish"),
      fanId,
      query: input.query.trim(),
      ...(normCity(input.city) ? { city: input.city!.trim() } : {}),
      ...(input.maxZar ? { maxZar: input.maxZar } : {}),
      createdAt: nowIso(),
    };
    state.wishes[record.id] = record;
    save();
    // Events that already fit show on the wishlist itself. Alerts are for what happens next.
    return this.toWish(record);
  }

  removeWish(fanId: string, wishId: string) {
    const w = state.wishes[wishId];
    if (!w || w.fanId !== fanId) throw notFound("That wish isn't on your list");
    delete state.wishes[wishId];
    save();
  }

  private fansWanting(d: EventLike): string[] {
    const fans = new Set<string>();
    for (const w of Object.values(state.wishes)) if (wishMatches(w, d)) fans.add(w.fanId);
    return [...fans];
  }

  private alertEvent(fanId: string, d: DropRecord, kind: AlertKind, lead?: string) {
    const where = d.city || d.venue;
    const when = new Date(d.startsAt).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Johannesburg" });
    // Don't repeat the same alert for the same event.
    if ((state.alerts[fanId] ?? []).some((a) => a.kind === kind && a.eventId === d.id)) return;
    const title =
      kind === "sale_open" ? `Sales are open: ${d.name}` : `${lead ? `${lead}: ` : "New: "}${d.name}`;
    const body =
      kind === "sale_open"
        ? `${where}, ${when}. ${randText(d.priceZar)} a ticket. Buy now or send your agent in.`
        : `${where}, ${when}, from ${randText(d.priceZar)}. ${d.state === "open" ? "On sale now." : "Sales open soon."}`;
    this.push(fanId, { kind, title, body, eventId: d.id });
  }

  // Called when a promoter lists a new event.
  onNewEvent(d: DropRecord) {
    for (const fanId of this.fansWanting(d)) this.alertEvent(fanId, d, "new_event");
  }

  // ---- Demand, for promoters ----

  demand(plan: { name?: string; city?: string; scene?: string; priceZar?: number }): Demand {
    const hasPlan = Boolean(plan.name || plan.city || plan.scene);
    const matching = hasPlan ? this.fansWanting({ name: plan.name ?? "", city: plan.city, scene: plan.scene, priceZar: plan.priceZar }).length : 0;
    // The most asked-for wishes, optionally in the planned city.
    const city = normCity(plan.city);
    const groups = new Map<string, { query: string; city?: string; fans: Set<string> }>();
    for (const w of Object.values(state.wishes)) {
      if (city && normCity(w.city) && normCity(w.city) !== city) continue;
      const key = `${w.query.toLowerCase()}|${normCity(w.city)}`;
      const g = groups.get(key) ?? { query: w.query, ...(w.city ? { city: w.city } : {}), fans: new Set<string>() };
      g.fans.add(w.fanId);
      groups.set(key, g);
    }
    const top = [...groups.values()]
      .map((g) => ({ query: g.query, ...(g.city ? { city: g.city } : {}), fans: g.fans.size }))
      .sort((a, b) => b.fans - a.fans)
      .slice(0, 5);
    return { matching, top };
  }

  // ---- Listen to what happens elsewhere in the app ----

  private handle(e: DropEvent) {
    const d = e.eventId ? state.drops[e.eventId] : undefined;
    if (!d) return;
    switch (e.type) {
      case "drop.opened": {
        // Fans who wished for this and haven't already sent an agent in.
        for (const fanId of this.fansWanting(d)) {
          if (state.mandates[`${fanId}:${d.id}`]?.status === "active") continue;
          this.alertEvent(fanId, d, "sale_open");
        }
        break;
      }
      case "sale.ticket_sent":
        // The SMS for this already goes out from the sale itself.
        if (e.fanId)
          this.push(e.fanId, { kind: "tickets", title: "Your tickets are in", body: `${d.name}. They're in your wallet, ready for the door.`, eventId: d.id }, { sms: false });
        break;
      case "mandate.blocked":
        if (e.fanId)
          this.push(e.fanId, { kind: "limit", title: "Your agent stopped at your limit", body: e.message, eventId: d.id }, { sms: false });
        break;
      case "resale.listed": {
        const l = e.listingId ? state.listings[e.listingId] : undefined;
        if (!l || d.state !== "sold_out" || Number(l.priceZar) > d.resaleCapZar) break;
        for (const w of Object.values(state.wishes)) {
          if (w.fanId === l.sellerFanId) continue;
          if (!wishMatches({ ...w, maxZar: undefined }, d)) continue;
          if (w.maxZar && Number(l.totalZar) > w.maxZar) continue;
          this.push(w.fanId, {
            kind: "resale",
            title: `A ${d.name} ticket came up`,
            body: `${randText(l.totalZar)} all-in from a verified fan, under your max. First to buy gets it.`,
            eventId: d.id,
          });
        }
        break;
      }
      case "resale.settled": {
        const l = e.listingId ? state.listings[e.listingId] : undefined;
        if (!l) break;
        this.push(l.sellerFanId, { kind: "sold", title: "Your ticket sold", body: `${randText(l.priceZar)} is in your wallet. It went to a verified fan.`, eventId: d.id }, { sms: false });
        if (l.buyerFanId)
          this.push(l.buyerFanId, { kind: "tickets", title: "You got a resale ticket", body: `${d.name}, ${randText(l.totalZar)} all-in. It's in your wallet.`, eventId: d.id }, { sms: false });
        break;
      }
      default:
        break;
    }
  }

  start() {
    events.subscribe((e) => {
      try {
        this.handle(e);
      } catch (error) {
        console.error("Alert failed:", error instanceof Error ? error.message : error);
      }
    });
  }
}

export const alerts = new Alerts();
