// Simulated backend for previews (VITE_MOCK=1). Same shapes as the real API, all in memory.
import type {
  AdminUser,
  AlertItem,
  BankTransfer,
  ChangeRequest,
  Payout,
  Wish,
  Drop,
  DropEvent,
  DropEventType,
  Listing,
  Mandate,
  Me,
  PromoterApplication,
  Role,
} from "@drop/shared";
import type { Api, AgentGoal } from "./api";
import { rand } from "./format";

const FX = 18;
const listeners = new Set<(e: DropEvent) => void>();
const history: DropEvent[] = [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Mock auth ----

export interface MockUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  phone?: string;
}

const PEOPLE: Record<string, MockUser> = {
  fan: { id: "u_thandi", email: "thandi@example.com", fullName: "Thandi Mokoena", role: "fan" },
  promoter: { id: "u_promoter", email: "promoter@example.com", fullName: "Khaya Nights", role: "promoter" },
  admin: { id: "u_admin", email: "admin@example.com", fullName: "Siyangena Admin", role: "admin" },
};

let current: MockUser | null = null;
const authListeners = new Set<() => void>();

export const mockAuth = {
  user: () => current,
  signIn(email: string, name?: string, role?: Role, _phone?: string) {
    const lower = email.toLowerCase();
    const known = Object.values(PEOPLE).find((p) => p.email === lower);
    current = known ?? {
      id: `u_${lower.replace(/[^a-z0-9]/g, "")}`,
      email: lower,
      fullName: name || lower.split("@")[0],
      role: lower.startsWith("admin") ? "admin" : role ?? (lower.startsWith("promoter") ? "promoter" : "fan"),
    };
    PEOPLE[current.id] = current;
    authListeners.forEach((l) => l());
    return current;
  },
  as(kind: "fan" | "promoter" | "admin") {
    return this.signIn(PEOPLE[kind].email);
  },
  signOut() {
    current = null;
    authListeners.forEach((l) => l());
  },
  onChange(l: () => void) {
    authListeners.add(l);
    return () => authListeners.delete(l);
  },
};

function who(): MockUser {
  if (!current) throw new Error("Sign in first");
  return current;
}

// ---- Mock data ----

const base = (o: Partial<Drop> & Pick<Drop, "id" | "name" | "venue" | "startsAt">): Drop => ({
  state: "scheduled",
  priceZar: "1200",
  priceRlusd: String(1200 / FX),
  supply: 3,
  sold: 0,
  maxPerFan: 4,
  resaleCapZar: "1800",
  resaleFeePct: 5,
  issuanceId: "demo",
  ...o,
});

const drops: Drop[] = [
  base({ id: "drop_sunset", category: "Music", name: "Sunset Sessions Live", venue: "Long Street, Cape Town", city: "Cape Town", scene: "longstreet", startsAt: "2026-12-12T19:00:00+02:00", promoterId: "u_promoter", promoterName: "Khaya Nights" }),
  base({ id: "drop_braam", category: "Nightlife", name: "Braam Rooftop Sessions", venue: "Braamfontein, Johannesburg", city: "Johannesburg", scene: "braamfontein", startsAt: "2026-12-18T20:00:00+02:00", priceZar: "250", priceRlusd: String(250 / FX), supply: 200, resaleCapZar: "300", promoterId: "u_other", promoterName: "Braam Collective" }),
  base({ id: "drop_florida", category: "Food and drink", name: "Florida Road Sundowner", venue: "Florida Road, Durban", city: "Durban", scene: "floridaroad", startsAt: "2026-12-19T16:00:00+02:00", priceZar: "180", priceRlusd: String(180 / FX), supply: 300, resaleCapZar: "220", promoterId: "u_other", promoterName: "Morningside Socials" }),
];

interface Account {
  verified: boolean;
  walletReady: boolean;
  allowance: number;
  tickets: Record<string, number>;
}
const accounts: Record<string, Account> = {};
const acct = (id: string) => (accounts[id] ??= { verified: false, walletReady: false, allowance: 0, tickets: {} });
// The demo buyer who picks up fair resale tickets in the preview.
accounts.u_sipho = { verified: true, walletReady: true, allowance: 1500, tickets: {} };
accounts.u_promoter = { verified: true, walletReady: true, allowance: 0, tickets: {} };
accounts.u_admin = { verified: true, walletReady: true, allowance: 0, tickets: {} };

const mandates: Record<string, Mandate> = {};
const listings: (Listing & { eventId: string })[] = [];
const stats: Record<string, { revenueRlusd: string; resales: number; feesRlusd: string }> = {};
const statsFor = (id: string) => (stats[id] ??= { revenueRlusd: "0", resales: 0, feesRlusd: "0" });
const applications: Record<string, PromoterApplication> = {
  u_promoter: { userId: "u_promoter", kind: "independent", displayName: "Khaya Nights", pastEvents: "Six sold-out nights at The Waiting Room", socials: "@khayanights", payoutDetails: "FNB, Khaya Nights", status: "approved", createdAt: "2026-11-01T10:00:00Z" },
  u_lerato: { userId: "u_lerato", kind: "business", displayName: "Lerato Live (Pty) Ltd", registrationNumber: "2019/442211/07", payoutDetails: "Absa, Lerato Live", status: "pending", createdAt: "2026-11-13T18:20:00Z", email: "lerato@example.com" },
  u_zama: { userId: "u_zama", kind: "independent", displayName: "Zama Gqom Sundays", pastEvents: "Two pop-ups in Umlazi", socials: "@zamagqom", payoutDetails: "Capitec, Z Dlamini", status: "pending", createdAt: "2026-11-13T19:05:00Z", email: "zama@example.com" },
};
const purchases: Record<string, string> = {};
const wishes: (Wish & { fanId: string })[] = [
  { id: "wish_seed1", fanId: "u_seed1", query: "Amapiano", city: "Cape Town", maxZar: "1500", createdAt: "2026-11-10T10:00:00Z", matches: 0, events: [] },
  { id: "wish_seed2", fanId: "u_seed2", query: "Sunset sessions", city: "Cape Town", createdAt: "2026-11-11T10:00:00Z", matches: 0, events: [] },
  { id: "wish_seed3", fanId: "u_seed3", query: "Rooftop", city: "Johannesburg", maxZar: "400", createdAt: "2026-11-12T10:00:00Z", matches: 0, events: [] },
];

function wishView(w: Wish & { fanId: string }): Wish {
  const { fanId: _f, ...rest } = w;
  const found = drops.filter((d) => (d.state === "open" || d.state === "scheduled") && wishFits(w, d));
  return {
    ...rest,
    matches: found.length,
    events: found.map((d) => ({ id: d.id, name: d.name, venue: d.venue, ...(d.city ? { city: d.city } : {}), startsAt: d.startsAt, priceZar: d.priceZar, state: d.state })),
  };
}
const alertsBy: Record<string, AlertItem[]> = {};
const checkins: Record<string, Record<string, number>> = {};
const turned: Record<string, number> = {};
const payoutList: Payout[] = [];
const mockShort: Record<string, string> = {};
const transfersBy: Record<string, BankTransfer[]> = {};
const changes: Record<string, ChangeRequest> = {};
const ref = (p: string) => `${p}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;

function pushAlert(fanId: string, a: Omit<AlertItem, "id" | "at" | "read">) {
  (alertsBy[fanId] ??= []).push({ ...a, id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), read: false });
}

function wishFits(w: { query: string; city?: string; maxZar?: string }, d: Drop) {
  const city = (w.city ?? "").toLowerCase();
  if (city && city !== "anywhere" && !`${d.city} ${d.venue}`.toLowerCase().includes(city)) return false;
  if (w.maxZar && Number(d.priceZar) > Number(w.maxZar)) return false;
  const words = w.query.toLowerCase().split(/\s+/).filter((x) => x.length > 2);
  const hay = `${d.name} ${d.venue} ${d.scene ?? ""} ${d.promoterName ?? ""}`.toLowerCase();
  return words.length === 0 ? Boolean(city) : words.some((x) => hay.includes(x));
}

function emit(type: DropEventType, extra: Partial<DropEvent> = {}) {
  const receipt = ["sale.paid", "sale.ticket_sent", "resale.settled"].includes(type) ? { explorerUrl: "#receipt" } : {};
  const event: DropEvent = { type, at: new Date().toISOString(), message: type, ...receipt, ...extra };
  history.push(event);
  if (type === "sale.ticket_sent" && extra.fanId) {
    pushAlert(extra.fanId, { kind: "tickets", title: "Your tickets are in", body: `${drops.find((d) => d.id === extra.eventId)?.name ?? "Your event"}. They're in your wallet, ready for the door.`, eventId: extra.eventId });
  }
  listeners.forEach((l) => l(event));
}

function drop(id: string) {
  const d = drops.find((x) => x.id === id);
  if (!d) throw new Error("Event not found");
  return d;
}

function meOf(u: MockUser): Me {
  const a = acct(u.id);
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    verified: a.verified,
    walletReady: a.walletReady,
    ...(a.walletReady ? { walletAddress: "rDemoWa11etXXXXXXXXXXXXXXXXXXXX" } : {}),
    ...(applications[u.id] ? { application: applications[u.id] } : {}),
    ...(u.phone ? { phone: u.phone } : {}),
    ...(changes[u.id] ? { changeRequest: changes[u.id] } : {}),
  };
}

function sell(fanId: string, eventId: string, priceZar: number) {
  const d = drop(eventId);
  const fee = (priceZar * d.resaleFeePct) / 100;
  const listing = {
    id: `listing_${listings.length + 1}`,
    eventId,
    sellerFanId: fanId,
    priceZar: String(priceZar),
    feeZar: fee.toFixed(2),
    totalZar: (priceZar + fee).toFixed(2),
    status: "open" as const,
  };
  listings.push(listing);
  emit("resale.listed", { fanId, eventId });
  // A waiting verified fan picks up fairly priced tickets.
  if (priceZar <= Number(d.resaleCapZar) && fanId !== "u_sipho") {
    setTimeout(async () => {
      listing.status = "signing" as any;
      emit("resale.sign_requested", { fanId, eventId });
      await wait(1400);
      (listing as any).status = "settled";
      acct(fanId).tickets[eventId] = Math.max(0, (acct(fanId).tickets[eventId] ?? 0) - 1);
      acct(fanId).allowance += priceZar;
      statsFor(eventId).resales += 1;
      emit("resale.settled", { fanId, eventId });
    }, 2500);
  }
  return listing;
}

async function agentBuy(fanId: string, eventId: string) {
  const d = drop(eventId);
  const m = mandates[`${fanId}:${eventId}`];
  if (!m) {
    emit("agent.action", { fanId, eventId, tool: "get_mandate", detail: "No limits yet. Set them first." });
    return;
  }
  emit("agent.action", { fanId, eventId, tool: "get_mandate", detail: `Read my limits: ${m.quantity} tickets, up to R${m.ceilingZar} each.` });
  if (d.state === "scheduled") {
    await wait(1600);
    d.state = "open";
    emit("drop.opened", { eventId });
  }
  await wait(900);
  const want = Math.min(m.quantity - m.bought, d.supply - d.sold);
  if (Number(d.priceZar) > Number(m.ceilingZar)) {
    emit("mandate.blocked", { fanId, eventId });
    return;
  }
  emit("sale.intent", { fanId, eventId });
  await wait(900);
  emit("agent.action", { fanId, eventId, tool: "buy_ticket", detail: `On sale at R${d.priceZar}, under my R${m.ceilingZar} limit. Buying ${want}.` });
  await wait(1100);
  acct(fanId).allowance -= want * Number(d.priceZar);
  emit("sale.paid", { fanId, eventId });
  await wait(1000);
  acct(fanId).tickets[eventId] = (acct(fanId).tickets[eventId] ?? 0) + want;
  m.bought += want;
  d.sold += want;
  emit("sale.ticket_sent", { fanId, eventId });
  if (d.sold >= d.supply) {
    d.state = "sold_out";
    emit("drop.sold_out", { eventId });
  }
}

export const mockApi: Api = {
  listEvents: async () => drops.filter((d) => d.state !== "cancelled").map((d) => ({ ...d })),
  getEvent: async (id) => ({ ...drop(id) }),
  listings: async (eventId) => listings.filter((l) => l.eventId === eventId).map((l) => ({ ...l })),
  subscribe: (onEvent) => {
    history.forEach(onEvent);
    listeners.add(onEvent);
    return () => listeners.delete(onEvent);
  },
  me: async () => meOf(who()),
  setup: async () => {
    await wait(1400);
    const a = acct(who().id);
    a.walletReady = true;
    if (a.allowance === 0) a.allowance = 0;
    return meOf(who());
  },
  verify: async () => {
    await wait(1200);
    acct(who().id).verified = true;
    return meOf(who());
  },
  wallet: async (eventId) => {
    const a = acct(who().id);
    return {
      allowanceRlusd: String(a.allowance / FX),
      allowanceZar: String(a.allowance),
      xrp: "10",
      tickets: eventId ? (a.tickets[eventId] ?? 0) : Object.values(a.tickets).reduce((n, c) => n + c, 0),
    };
  },
  topUp: async (amountZar) => {
    await wait(900);
    acct(who().id).allowance += amountZar;
    return mockApi.wallet();
  },
  tickets: async (eventId) => {
    const a = acct(who().id);
    const held = Object.entries(a.tickets)
      .filter(([id, c]) => c > 0 && drop(id).state !== "cancelled")
      .map(([id, count]) => {
        const d = drop(id);
        return { eventId: id, name: d.name, venue: d.venue, startsAt: d.startsAt, count };
      });
    return { count: eventId ? (a.tickets[eventId] ?? 0) : held.reduce((n, h) => n + h.count, 0), events: held, history: [] };
  },
  apply: async (input) => {
    const u = who();
    applications[u.id] = { userId: u.id, ...input, status: "pending", createdAt: new Date().toISOString(), email: u.email };
    return applications[u.id];
  },
  myAgents: async () => {
    const me = who().id;
    return Object.values(mandates)
      .filter((m) => m.fanId === me && m.status !== "cancelled")
      .flatMap((m) => {
        const d = drops.find((x) => x.id === m.eventId);
        if (!d) return [];
        return [{ eventId: d.id, eventName: d.name, venue: d.venue, startsAt: d.startsAt, eventState: d.state, mandate: m, running: false }];
      });
  },
  getMandate: async (eventId) => mandates[`${who().id}:${eventId}`] ?? null,
  putMandate: async (eventId, body) => {
    const id = `${who().id}:${eventId}`;
    const existing = mandates[id];
    mandates[id] = { id: `mandate_${id}`, fanId: who().id, eventId, quantity: body.quantity, ceilingZar: String(body.ceilingZar), bought: existing?.bought ?? 0, status: "active" };
    const a = acct(who().id);
    a.allowance = Math.max(a.allowance, body.quantity * body.ceilingZar);
    return mandates[id];
  },
  buy: async (eventId, quantity) => {
    const u = who();
    const d = drop(eventId);
    const a = acct(u.id);
    if (d.state !== "open") throw new Error(d.state === "sold_out" ? "This event is sold out" : "Sales are not open yet");
    const cost = quantity * Number(d.priceZar);
    if (a.allowance < cost) throw new Error("Not enough money in your Siyangena wallet. Top up and try again.");
    const requestId = `req_${Date.now()}`;
    purchases[requestId] = "pending";
    emit("sale.intent", { fanId: u.id, eventId });
    setTimeout(async () => {
      a.allowance -= cost;
      emit("sale.paid", { fanId: u.id, eventId });
      await wait(900);
      a.tickets[eventId] = (a.tickets[eventId] ?? 0) + quantity;
      d.sold += quantity;
      statsFor(eventId).revenueRlusd = String(Number(statsFor(eventId).revenueRlusd) + cost / FX);
      purchases[requestId] = "fulfilled";
      emit("sale.ticket_sent", { fanId: u.id, eventId });
      if (d.sold >= d.supply) {
        d.state = "sold_out";
        emit("drop.sold_out", { eventId });
      }
    }, 900);
    return { requestId };
  },
  purchase: async (requestId) => (purchases[requestId] ? { status: purchases[requestId] } : null),
  runAgent: async (eventId, goal: AgentGoal, priceZar) => {
    const u = who();
    emit("agent.action", { fanId: u.id, eventId, tool: "run", detail: goal === "buy" ? "Armed. Watching for tickets to go on sale." : "Checking resale listings from verified ticket holders." });
    if (goal === "buy") agentBuy(u.id, eventId).catch(() => undefined);
    if (goal === "sell") sell(u.id, eventId, priceZar ?? 1250);
  },
  resell: async (eventId, priceZar) => {
    const u = who();
    if ((acct(u.id).tickets[eventId] ?? 0) < 1) throw new Error("You don't have a ticket to sell for this event");
    return sell(u.id, eventId, priceZar);
  },
  buyListing: async (listingId) => {
    const u = who();
    const l = listings.find((x) => x.id === listingId);
    if (!l || l.status !== "open") throw new Error("That ticket has gone");
    if (acct(u.id).allowance < Number(l.totalZar)) throw new Error("Not enough money in your Siyangena wallet. Top up and try again.");
    l.status = "settled";
    acct(u.id).allowance -= Number(l.totalZar);
    acct(u.id).tickets[l.eventId] = (acct(u.id).tickets[l.eventId] ?? 0) + 1;
    acct(l.sellerFanId).tickets[l.eventId] = Math.max(0, (acct(l.sellerFanId).tickets[l.eventId] ?? 0) - 1);
    statsFor(l.eventId).resales += 1;
    emit("resale.settled", { fanId: u.id, eventId: l.eventId });
    return { status: "settled" };
  },
  wishes: async () => wishes.filter((w) => w.fanId === who().id).map(wishView),
  addWish: async (body) => {
    const w = { id: `wish_${Date.now()}`, fanId: who().id, query: body.query, ...(body.city ? { city: body.city } : {}), ...(body.maxZar ? { maxZar: String(body.maxZar) } : {}), createdAt: new Date().toISOString(), matches: 0, events: [] };
    wishes.push(w);
    return wishView(w);
  },
  removeWish: async (id) => {
    const i = wishes.findIndex((w) => w.id === id && w.fanId === who().id);
    if (i >= 0) wishes.splice(i, 1);
  },
  alerts: async () => [...(alertsBy[who().id] ?? [])].reverse(),
  readAlerts: async () => {
    for (const a of alertsBy[who().id] ?? []) a.read = true;
  },
  ticketPass: async (eventId) => {
    if ((acct(who().id).tickets[eventId] ?? 0) < 1) throw new Error("You don't hold a ticket for this event");
    const exp = Date.now() + 60_000;
    const code = `S1.${eventId}.${who().id}.${exp}.${"m".repeat(22)}`;
    const short = Math.random().toString(36).slice(2, 10).toUpperCase().replace(/(.{4})/, "$1-");
    mockShort[short] = code;
    return { code, short, expiresAt: new Date(exp).toISOString() };
  },
  myEvents: async () => {
    const u = who();
    return drops.filter((d) => u.role === "admin" || d.promoterId === u.id).map((d) => ({ ...d }));
  },
  createEvent: async (body) => {
    const u = who();
    if (u.role !== "admin" && applications[u.id]?.status !== "approved") throw new Error("Your promoter account is still being reviewed");
    await wait(1000);
    const d = base({
      ...body,
      id: `drop_${drops.length + 1}`,
      priceZar: String(body.priceZar),
      priceRlusd: String(body.priceZar / FX),
      resaleCapZar: String(body.resaleCapZar),
      promoterId: u.id,
      promoterName: applications[u.id]?.displayName ?? u.fullName,
      review: { status: "pending", submittedAt: new Date().toISOString() },
    });
    drops.push(d);
    return { ...d };
  },
  openSales: async (id) => {
    const d = drop(id);
    if (d.promoterId !== who().id) throw new Error("This isn't your event");
    if (d.review && d.review.status !== "approved") throw new Error("This event is still being reviewed. Sales can open once it's approved.");
    d.state = "open";
    emit("drop.opened", { eventId: id });
    return { ...d };
  },
  closeSales: async (id) => {
    const d = drop(id);
    if (d.promoterId !== who().id) throw new Error("This isn't your event");
    d.state = "closed";
    return { ...d };
  },
  updateEvent: async (id, body) => {
    const d = drop(id);
    if (d.promoterId !== who().id) throw new Error("This isn't your event");
    if (body.resaleCapZar !== undefined) d.resaleCapZar = String(body.resaleCapZar);
    if (body.resaleFeePct !== undefined) d.resaleFeePct = body.resaleFeePct;
    if (body.maxPerFan !== undefined) d.maxPerFan = body.maxPerFan;
    return { ...d };
  },
  stats: async (id) => ({ sold: drop(id).sold, ...statsFor(id) }),
  demand: async (plan) => {
    const fake = base({ id: "plan", name: plan.name ?? "", venue: plan.city ?? "", city: plan.city, scene: plan.scene, startsAt: "", priceZar: String(plan.priceZar ?? 0) });
    const matching = plan.name || plan.city ? new Set(wishes.filter((w) => wishFits(w, fake)).map((w) => w.fanId)).size : 0;
    const groups = new Map<string, { query: string; city?: string; fans: Set<string> }>();
    for (const w of wishes) {
      if (plan.city && w.city && w.city.toLowerCase() !== plan.city.toLowerCase()) continue;
      const k = `${w.query.toLowerCase()}|${(w.city ?? "").toLowerCase()}`;
      const g = groups.get(k) ?? { query: w.query, ...(w.city ? { city: w.city } : {}), fans: new Set<string>() };
      g.fans.add(w.fanId);
      groups.set(k, g);
    }
    const top = [...groups.values()].map((g) => ({ query: g.query, ...(g.city ? { city: g.city } : {}), fans: g.fans.size })).sort((a, b) => b.fans - a.fans).slice(0, 5);
    return { matching, top };
  },
  cancelPreview: async (id) => {
    const d = drop(id);
    const holders = Object.values(accounts).filter((a) => (a.tickets[id] ?? 0) > 0);
    const tickets = holders.reduce((n, a) => n + (a.tickets[id] ?? 0), 0);
    const total = tickets * Number(d.priceZar);
    return { holders: holders.length, tickets, faceZar: String(total), resaleExtraZar: "0", totalZar: String(total) };
  },
  cancelEvent: async (id, reason) => {
    const d = drop(id);
    if (d.promoterId !== who().id) throw new Error("This isn't your event");
    if (d.state === "closed" || d.state === "cancelled") throw new Error("Sales are closed for this event, so it can't be cancelled here");
    const holders = Object.entries(accounts).filter(([, a]) => (a.tickets[id] ?? 0) > 0);
    const total = holders.reduce((n, [, a]) => n + (a.tickets[id] ?? 0) * Number(d.priceZar), 0);
    d.state = "cancelled";
    d.cancel = { reason, at: new Date().toISOString(), holders: holders.length, refunded: 0, totalZar: String(total), refundedZar: "0", done: holders.length === 0 };
    (async () => {
      for (const [fanId, a] of holders) {
        await wait(700);
        const back = (a.tickets[id] ?? 0) * Number(d.priceZar);
        a.allowance += back;
        d.cancel!.refunded += 1;
        d.cancel!.refundedZar = String(Number(d.cancel!.refundedZar) + back);
        pushAlert(fanId, { kind: "cancelled", title: `${d.name} is cancelled`, body: `${reason} ${rand(back)} is back in your wallet.`, eventId: id });
        emit("drop.cancelled", { eventId: id });
      }
      d.cancel!.done = true;
      emit("drop.cancelled", { eventId: id });
    })();
    return { ...d };
  },
  checkIn: async (id, raw) => {
    const d = drop(id);
    const typed = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const code = !raw.includes(".") && typed.length === 8 ? mockShort[`${typed.slice(0, 4)}-${typed.slice(4)}`] ?? "" : raw;
    const parts = code.trim().split(".");
    const bad = (reason: "bad_code" | "wrong_event" | "cancelled" | "expired" | "used" | "no_ticket", message: string) => {
      turned[id] = (turned[id] ?? 0) + 1;
      return { ok: false, reason, message };
    };
    if (parts.length !== 5 || parts[0] !== "S1") return bad("bad_code", "That isn't a Siyangena ticket");
    if (parts[1] !== id) return bad("wrong_event", "This ticket is for a different event");
    if (d.state === "cancelled") return bad("cancelled", "This event was cancelled and refunded");
    if (Number(parts[3]) < Date.now()) return bad("expired", "Old code, likely a screenshot. Ask them to open the ticket in the app.");
    const held = acct(parts[2]).tickets[id] ?? 0;
    const name = PEOPLE[parts[2]]?.fullName ?? "Fan";
    if (held < 1) return bad("no_ticket", "This wallet holds no ticket for this event");
    const used = ((checkins[id] ??= {})[parts[2]] ??= 0);
    if (used >= held) return { ...bad("used", "Already used. Scanned earlier tonight."), fanName: name, of: held };
    checkins[id][parts[2]] = used + 1;
    return { ok: true, message: "Let them in", fanName: name, ticket: used + 1, of: held, at: new Date().toISOString() };
  },
  doorStats: async (id) => ({
    checkedIn: Object.values(checkins[id] ?? {}).reduce((a, b) => a + b, 0),
    sold: drop(id).sold,
    turnedAway: turned[id] ?? 0,
  }),
  payouts: async () => {
    const u = who();
    const mine = drops.filter((d) => d.promoterId === u.id);
    const history = payoutList.filter((p) => p.promoterId === u.id);
    const lines = mine.map((d) => {
      const st = statsFor(d.id);
      const sales = Number(st.revenueRlusd) * FX;
      const fees = Number(st.feesRlusd) * FX;
      const refunded = Number(d.cancel?.refundedZar ?? 0);
      const held = applications[u.id]?.kind !== "business" && d.state !== "cancelled" && new Date(d.startsAt).getTime() + 864e5 > Date.now();
      const gross = Math.max(0, sales + fees - refunded);
      const platformFee = gross * 0.05;
      const net = gross - platformFee;
      const paid = history.filter((p) => p.eventId === d.id && p.status === "paid").reduce((n, p) => n + Number(p.amountZar), 0);
      const requested = history.filter((p) => p.eventId === d.id && p.status === "requested").reduce((n, p) => n + Number(p.amountZar), 0);
      const available = held ? 0 : Math.max(0, net - paid - requested);
      return { eventId: d.id, name: d.name, startsAt: d.startsAt, state: d.state, salesZar: sales.toFixed(2), feesZar: fees.toFixed(2), refundedZar: refunded.toFixed(2), held, netZar: net.toFixed(2), platformFeeZar: platformFee.toFixed(2), requestedZar: requested.toFixed(2), paidZar: paid.toFixed(2), availableZar: available.toFixed(2) };
    });
    // Payouts are automatic: anything due goes straight out.
    const due = lines.filter((l) => Number(l.availableZar) > 0);
    if (due.length) {
      for (const l of due) payoutList.unshift({ id: `payout_${Date.now()}_${l.eventId}`, promoterId: u.id, promoterName: u.fullName, eventId: l.eventId, eventName: l.name, amountZar: l.availableZar, status: "paid", bank: "FNB, account ending 4417", createdAt: new Date().toISOString(), paidAt: new Date().toISOString(), reference: ref("PAY"), explorerUrl: "#receipt" });
      return mockApi.payouts();
    }
    const sum = (k: "netZar" | "feesZar" | "refundedZar" | "availableZar") => lines.reduce((n, l) => n + Number(l[k]), 0);
    const held = lines.filter((l) => l.held).reduce((n, l) => n + Number(l.netZar) - Number(l.paidZar) - Number(l.requestedZar), 0);
    return {
      earnedZar: sum("netZar").toFixed(2),
      platformFeePct: 5,
      platformFeeZar: lines.reduce((n, l) => n + Number(l.platformFeeZar), 0).toFixed(2),
      feesZar: sum("feesZar").toFixed(2),
      resales: mine.reduce((n, d) => n + statsFor(d.id).resales, 0),
      heldZar: held.toFixed(2),
      paidZar: history.filter((p) => p.status === "paid").reduce((n, p) => n + Number(p.amountZar), 0).toFixed(2),
      requestedZar: history.filter((p) => p.status === "requested").reduce((n, p) => n + Number(p.amountZar), 0).toFixed(2),
      availableZar: sum("availableZar").toFixed(2),
      refundedZar: sum("refundedZar").toFixed(2),
      kind: applications[u.id]?.kind ?? "independent",
      bank: "FNB, account ending 4417",
      ...(applications[u.id]?.kind !== "business" && mine.some((d) => d.state !== "cancelled" && new Date(d.startsAt).getTime() + 864e5 > Date.now())
        ? { nextPayoutAt: new Date(Math.min(...mine.filter((d) => d.state !== "cancelled").map((d) => new Date(d.startsAt).getTime())) + 864e5).toISOString() }
        : {}),
      events: lines,
      history,
    };
  },
  requestPayout: async (eventId) => {
    const s = await mockApi.payouts();
    const line = s.events.find((e) => e.eventId === eventId);
    if (!line || Number(line.availableZar) <= 0) throw new Error(line?.held ? "This event's money is held until the morning after the event" : "Nothing to pay out for this event yet");
    const p: Payout = { id: `payout_${Date.now()}`, promoterId: who().id, promoterName: who().fullName, eventId, eventName: line.name, amountZar: line.availableZar, status: "requested", bank: s.bank, createdAt: new Date().toISOString() };
    payoutList.unshift(p);
    return p;
  },
  allPayouts: async () => payoutList,
  revenue: async () => {
    const sales = drops.reduce((n, d) => n + Number(statsFor(d.id).revenueRlusd) * FX, 0);
    const resale = drops.reduce((n, d) => n + Number(statsFor(d.id).feesRlusd) * FX, 0);
    const back = drops.reduce((n, d) => n + Number(d.cancel?.refundedZar ?? 0), 0);
    return { feePct: 5, feesZar: (Math.max(0, sales + resale - back) * 0.05).toFixed(2), ticketSalesZar: sales.toFixed(2), resaleFeesZar: resale.toFixed(2), paidOutZar: payoutList.filter((p) => p.status === "paid").reduce((n, p) => n + Number(p.amountZar), 0).toFixed(2) };
  },
  eventsInReview: async () => drops.filter((d) => d.review && d.review.status !== "approved" && d.state !== "cancelled").map((d) => ({ ...d })),
  reviewEvent: async (id, decision, note) => {
    const d = drop(id);
    d.review = { status: decision, ...(note ? { note } : {}), submittedAt: d.review?.submittedAt ?? new Date().toISOString(), reviewedAt: new Date().toISOString() };
    return { ...d };
  },
  editEvent: async (id, body) => {
    const d = drop(id);
    if (!d.review || d.review.status === "approved") throw new Error("This event is approved. Only the per-person limit, resale cap and fee can change now.");
    if (body.name) d.name = body.name;
    if (body.category) d.category = body.category as Drop["category"];
    if (body.venue) d.venue = body.venue;
    if (body.city !== undefined) d.city = body.city || undefined;
    if (body.startsAt) d.startsAt = body.startsAt;
    if (body.priceZar) d.priceZar = String(body.priceZar);
    if (body.maxPerFan) d.maxPerFan = body.maxPerFan;
    if (body.resaleCapZar) d.resaleCapZar = String(body.resaleCapZar);
    if (body.resaleFeePct !== undefined) d.resaleFeePct = body.resaleFeePct;
    if (body.posterUrl !== undefined) d.posterUrl = body.posterUrl || undefined;
    if (body.resubmit && d.review.status === "needs_more") d.review = { status: "pending", submittedAt: new Date().toISOString() };
    return { ...d };
  },
  resubmitEvent: async (id) => {
    const d = drop(id);
    if (d.review?.status === "needs_more") d.review = { status: "pending", submittedAt: new Date().toISOString() };
    return { ...d };
  },
  changeRequests: async () =>
    Object.values(changes)
      .filter((c) => c.status === "pending")
      .map((c) => ({ ...c, email: PEOPLE[c.userId]?.email, current: { displayName: applications[c.userId]?.displayName, registrationNumber: applications[c.userId]?.registrationNumber, payoutDetails: applications[c.userId]?.payoutDetails } })),
  reviewChange: async (userId, decision, note) => {
    const c = changes[userId];
    if (decision === "approved" && applications[userId]) {
      if (c.displayName) applications[userId].displayName = c.displayName;
      if (c.registrationNumber !== undefined) applications[userId].registrationNumber = c.registrationNumber;
      if (c.payoutDetails) applications[userId].payoutDetails = c.payoutDetails;
    }
    c.status = decision;
    c.note = note;
    c.reviewedAt = new Date().toISOString();
    return c;
  },
  updateProfile: async (body) => {
    const u = who();
    if (body.fullName) u.fullName = body.fullName;
    if (body.phone !== undefined) u.phone = body.phone;
    return meOf(u);
  },
  updatePromoterDetails: async (body) => {
    const u = who();
    const a = applications[u.id];
    if (!a) throw new Error("Apply as a promoter first");
    if (body.socials !== undefined) a.socials = body.socials;
    if (body.pastEvents !== undefined) a.pastEvents = body.pastEvents;
    const crit: Partial<ChangeRequest> = {};
    if (body.displayName !== undefined && body.displayName !== a.displayName) crit.displayName = body.displayName;
    if (body.registrationNumber !== undefined && body.registrationNumber !== (a.registrationNumber ?? "")) crit.registrationNumber = body.registrationNumber;
    if (body.payoutDetails !== undefined && body.payoutDetails !== (a.payoutDetails ?? "")) crit.payoutDetails = body.payoutDetails;
    if (Object.keys(crit).length) changes[u.id] = { userId: u.id, ...crit, status: "pending", createdAt: new Date().toISOString() };
    return meOf(u);
  },
  transfers: async () => {
    const list = transfersBy[who().id] ?? [];
    for (const t of list) if (t.status === "processing" && Date.now() - new Date(t.createdAt).getTime() > 15000) {
      t.status = "completed";
      t.completedAt = new Date().toISOString();
    }
    return [...list];
  },
  deposit: async (body) => {
    await wait(1400);
    let method: string;
    if (body.method === "card") {
      const digits = (body.cardNumber ?? "").replace(/\D/g, "");
      if (digits === "4000000000000002") throw new Error("Your bank declined this card. Try another card.");
      if (digits !== "4242424242424242") throw new Error("Use the test card 4242 4242 4242 4242");
      method = `Visa ending ${digits.slice(-4)}`;
    } else {
      if (!body.bank) throw new Error("Choose your bank");
      method = `Instant EFT, ${body.bank}`;
    }
    acct(who().id).allowance += body.amountZar;
    const t: BankTransfer = { id: `dep_${Date.now()}`, kind: "deposit", amountZar: String(body.amountZar), method, status: "completed", reference: ref("SIYA"), createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), explorerUrl: "#receipt" };
    (transfersBy[who().id] ??= []).unshift(t);
    return t;
  },
  cashOut: async (body) => {
    await wait(1200);
    const a = acct(who().id);
    if (body.amountZar > a.allowance) throw new Error("That's more than you can cash out right now");
    a.allowance -= body.amountZar;
    const digits = body.accountNumber.replace(/\D/g, "");
    const t: BankTransfer = { id: `out_${Date.now()}`, kind: "cashout", amountZar: String(body.amountZar), method: `${body.bank}, account ending ${digits.slice(-4)}`, status: "processing", reference: ref("SIYA"), createdAt: new Date().toISOString(), explorerUrl: "#receipt" };
    (transfersBy[who().id] ??= []).unshift(t);
    return t;
  },
  markPayoutPaid: async (id) => {
    const p = payoutList.find((x) => x.id === id)!;
    await wait(1200);
    p.status = "paid";
    p.paidAt = new Date().toISOString();
    p.reference = ref("PAY");
    p.explorerUrl = "#receipt";
    return p;
  },
  applications: async (status) => Object.values(applications).filter((a) => !status || a.status === status),
  review: async (userId, decision, note) => {
    const a = applications[userId];
    a.status = decision;
    a.reviewNote = note;
    a.reviewedAt = new Date().toISOString();
    return a;
  },
  users: async (): Promise<AdminUser[]> =>
    Object.values(PEOPLE).map((p) => ({ id: p.id, email: p.email, fullName: p.fullName, role: p.role, verified: acct(p.id).verified, createdAt: "2026-11-13T18:00:00Z" })),
  setRole: async (userId, role) => {
    if (PEOPLE[userId]) PEOPLE[userId].role = role;
  },
};

// Demo helpers for the promoter's "Try a bad actor" panel in the preview.
export const mockDemo = {
  scalperLists: (eventId: string) => {
    emit("resale.listed", { fanId: "scalper", eventId });
    emit("resale.refused", { fanId: "scalper", eventId });
  },
  fakeTicket: (eventId: string) => emit("ledger.rejected", { fanId: "scammer", eventId }),
};
