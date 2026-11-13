// Simulated backend for previews (VITE_MOCK=1). Same shapes as the real API.
import type { Drop, DropEvent, DropEventType, Fan, Listing, Mandate } from "@drop/shared";
import type { Api, AgentGoal } from "./api";

const FX = 18;
const listeners = new Set<(e: DropEvent) => void>();
const history: DropEvent[] = [];

const drop: Drop = {
  id: "drop_demo",
  name: "Sunset Sessions Live",
  venue: "Long Street, Cape Town",
  startsAt: "2026-12-12T19:00:00+02:00",
  state: "scheduled",
  priceZar: "1200",
  priceRlusd: String(1200 / FX),
  supply: 3,
  sold: 0,
  maxPerFan: 4,
  resaleCapZar: "1800",
  resaleFeePct: 5,
  issuanceId: "demo",
};

const fans: Record<string, Fan & { allowance: number; tickets: number }> = {
  thandi: { id: "thandi", name: "Thandi", address: "", agentAddress: "", verified: false, allowance: 3000, tickets: 0 },
  sipho: { id: "sipho", name: "Sipho", address: "", agentAddress: "", verified: false, allowance: 1500, tickets: 0 },
  scalper: { id: "scalper", name: "Scalper", address: "", agentAddress: "", verified: true, allowance: 1200, tickets: 0 },
};
const mandates: Record<string, Mandate> = {
  thandi: { id: "mandate_thandi", fanId: "thandi", quantity: 2, ceilingZar: "1500", bought: 0, status: "active" },
  sipho: { id: "mandate_sipho", fanId: "sipho", quantity: 1, ceilingZar: "1500", bought: 0, status: "active" },
};
const listings: Listing[] = [];
const stats = { sold: 0, revenueRlusd: "0", resales: 0, feesRlusd: "0" };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function emit(type: DropEventType, extra: Partial<DropEvent> = {}) {
  const receipt = ["sale.paid", "sale.ticket_sent", "resale.settled"].includes(type) ? { explorerUrl: "#receipt" } : {};
  const event: DropEvent = { type, at: new Date().toISOString(), message: type, ...receipt, ...extra };
  history.push(event);
  listeners.forEach((l) => l(event));
}

function ensureFan(id: string) {
  const fan = fans[id];
  if (!fan) throw new Error(`Unknown fan ${id}`);
  return fan;
}

async function buy(fanId: string) {
  const fan = ensureFan(fanId);
  const m = mandates[fanId];
  if (!m) {
    emit("agent.action", { fanId, tool: "get_mandate", detail: "No mandate yet. Set one first." });
    return;
  }
  emit("agent.action", { fanId, tool: "get_mandate", detail: `Read my limits: ${m.quantity} tickets, up to R${Number(m.ceilingZar).toLocaleString("en-ZA").replace(/\s/g, ",")} each.` });
  if (drop.state === "scheduled") {
    await wait(1600);
    drop.state = "open";
    emit("drop.opened");
  }
  await wait(900);
  const want = Math.min(m.quantity - m.bought, drop.supply - drop.sold);
  if (Number(drop.priceZar) > Number(m.ceilingZar)) {
    emit("mandate.blocked", { fanId });
    return;
  }
  emit("sale.intent", { fanId });
  await wait(900);
  emit("agent.action", {
    fanId,
    tool: "buy_ticket",
    detail: `On sale at R1,200, under my R1,500 limit. Buying ${want}.`,
  });
  await wait(1100);
  fan.allowance -= want * Number(drop.priceZar);
  emit("sale.paid", { fanId });
  await wait(1000);
  fan.tickets += want;
  m.bought += want;
  drop.sold += want;
  stats.sold = drop.sold;
  emit("sale.ticket_sent", { fanId });
  if (drop.sold >= drop.supply) {
    drop.state = "sold_out";
    emit("drop.sold_out");
  }
}

async function resale(fanId: string) {
  const fan = ensureFan(fanId);
  const m = mandates[fanId];
  emit("agent.action", { fanId, tool: "browse_resale", detail: "Checking resale listings from verified fans." });
  await wait(1000);
  const open = listings.filter((l) => l.status === "open" && l.sellerFanId !== fanId);
  for (const l of open) {
    if (m && Number(l.totalZar) > Number(m.ceilingZar)) {
      emit("agent.action", { fanId, tool: "browse_resale", detail: `Passed on R${l.totalZar} all-in: over my R${m.ceilingZar} ceiling.` });
      await wait(700);
    }
  }
  const fit = open.find((l) => m && Number(l.totalZar) <= Number(m.ceilingZar));
  if (!fit) return;
  fit.status = "signing";
  emit("resale.sign_requested", { fanId });
  await wait(1400);
  fit.status = "settled";
  fan.allowance -= Number(fit.totalZar);
  fan.tickets += 1;
  ensureFan(fit.sellerFanId).tickets -= 1;
  ensureFan(fit.sellerFanId).allowance += Number(fit.priceZar);
  stats.resales += 1;
  emit("agent.action", { fanId, tool: "accept_resale", detail: `R${fit.totalZar} all-in fits my R${m!.ceilingZar} ceiling.` });
  emit("resale.settled", { fanId });
}

async function sell(fanId: string, priceZar: number) {
  const fee = (priceZar * drop.resaleFeePct) / 100;
  const listing: Listing = {
    id: `listing_${listings.length + 1}`,
    sellerFanId: fanId,
    priceZar: String(priceZar),
    feeZar: fee.toFixed(2),
    totalZar: (priceZar + fee).toFixed(2),
    status: "open",
  };
  listings.push(listing);
  emit("agent.action", { fanId, tool: "list_for_resale", detail: `My human can't go. Listed at R${priceZar}.` });
  emit("resale.listed", { fanId });
  // In the preview, a waiting verified fan picks up fairly priced tickets.
  if (fanId !== "scalper" && fanId !== "sipho") setTimeout(() => resale("sipho").catch(() => undefined), 2500);
}

export const mockApi: Api = {
  getDrop: async () => ({ ...drop }),
  getFans: async () => Object.values(fans).map(({ allowance: _a, tickets: _t, ...f }) => f),
  getWallet: async (id) => {
    const f = ensureFan(id);
    return { allowanceRlusd: String(f.allowance / FX), allowanceZar: String(f.allowance), xrp: "10", tickets: f.tickets };
  },
  getTickets: async (id) => ({ count: ensureFan(id).tickets, history: [] }),
  getMandate: async (id) => mandates[id] ?? null,
  putMandate: async (id, body) => {
    const existing = mandates[id];
    mandates[id] = {
      id: existing?.id ?? `mandate_${id}`,
      fanId: id,
      quantity: body.quantity,
      ceilingZar: String(body.ceilingZar),
      bought: existing?.bought ?? 0,
      status: "active",
    };
    ensureFan(id).allowance = Math.max(ensureFan(id).allowance, body.quantity * body.ceilingZar);
    return mandates[id];
  },
  verifyFan: async (id) => {
    await wait(1200);
    ensureFan(id).verified = true;
    return (await mockApi.getFans()).find((f) => f.id === id)!;
  },
  listListings: async () => listings.map((l) => ({ ...l })),
  runAgent: async (id, goal: AgentGoal, priceZar) => {
    const run = goal === "buy" ? buy(id) : goal === "resale" ? resale(id) : sell(id, priceZar ?? 1250);
    run.catch(() => undefined);
  },
  createDrop: async (body) => {
    Object.assign(drop, {
      ...body,
      priceZar: String(body.priceZar),
      resaleCapZar: String(body.resaleCapZar),
      state: "scheduled",
      sold: 0,
    });
    return { ...drop };
  },
  openSales: async () => {
    drop.state = "open";
    emit("drop.opened");
    return { ...drop };
  },
  closeSales: async () => {
    drop.state = "closed";
    return { ...drop };
  },
  updateDrop: async (body) => {
    if (body.resaleCapZar !== undefined) drop.resaleCapZar = String(body.resaleCapZar);
    if (body.resaleFeePct !== undefined) drop.resaleFeePct = body.resaleFeePct;
    if (body.maxPerFan !== undefined) drop.maxPerFan = body.maxPerFan;
    return { ...drop };
  },
  getStats: async () => ({ ...stats, revenueRlusd: String((drop.sold * Number(drop.priceZar)) / FX) }),
  subscribe: (onEvent) => {
    history.forEach(onEvent);
    listeners.add(onEvent);
    return () => listeners.delete(onEvent);
  },
};

// Demo helpers for the preview's demo panel.
export const mockDemo = {
  scalperLists: () => sell("scalper", 1700),
  fakeTicket: () => emit("ledger.rejected", { fanId: "thandi" }),
};
