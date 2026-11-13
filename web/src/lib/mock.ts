// Simulated backend for previews (VITE_MOCK=1). Same shapes as the real API, all in memory.
import type {
  AdminUser,
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
  base({ id: "drop_sunset", name: "Sunset Sessions Live", venue: "Long Street, Cape Town", city: "Cape Town", scene: "longstreet", startsAt: "2026-12-12T19:00:00+02:00", promoterId: "u_promoter", promoterName: "Khaya Nights" }),
  base({ id: "drop_braam", name: "Braam Rooftop Sessions", venue: "Braamfontein, Johannesburg", city: "Johannesburg", scene: "braamfontein", startsAt: "2026-12-18T20:00:00+02:00", priceZar: "250", priceRlusd: String(250 / FX), supply: 200, resaleCapZar: "300", promoterId: "u_other", promoterName: "Braam Collective" }),
  base({ id: "drop_florida", name: "Florida Road Sundowner", venue: "Florida Road, Durban", city: "Durban", scene: "floridaroad", startsAt: "2026-12-19T16:00:00+02:00", priceZar: "180", priceRlusd: String(180 / FX), supply: 300, resaleCapZar: "220", promoterId: "u_other", promoterName: "Morningside Socials" }),
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

function emit(type: DropEventType, extra: Partial<DropEvent> = {}) {
  const receipt = ["sale.paid", "sale.ticket_sent", "resale.settled"].includes(type) ? { explorerUrl: "#receipt" } : {};
  const event: DropEvent = { type, at: new Date().toISOString(), message: type, ...receipt, ...extra };
  history.push(event);
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
      .filter(([, c]) => c > 0)
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
    emit("agent.action", { fanId: u.id, eventId, tool: "run", detail: goal === "buy" ? "Armed. Watching for tickets to go on sale." : "Checking resale listings from verified fans." });
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
    });
    drops.push(d);
    return { ...d };
  },
  openSales: async (id) => {
    const d = drop(id);
    if (d.promoterId !== who().id) throw new Error("This isn't your event");
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
