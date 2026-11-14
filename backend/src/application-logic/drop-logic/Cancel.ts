import { state, save, touchDrop } from "../../lib/store";
import { conflict } from "../../lib/utils/errors";
import { nowIso } from "../../lib/utils/ids";
import { settleToZar, zar, zarToSettle } from "../../lib/utils/money";
import { xrplMpt } from "../../xrpl/xrpl.mpt";
import { xrplPayments } from "../../xrpl/xrpl.payments";
import { Fans } from "../fan-logic/Fans";
import { Events } from "../event-logic/Events";
import { alerts, randText } from "../alert-logic/Alerts";
import { Drop } from "./Drop";

const dropService = new Drop();
const fanService = new Fans();
const events = new Events();

interface Holder {
  fanId: string;
  address: string;
  tickets: number;
  refundZar: number;
}

// Who holds tickets for this event, and what each is owed: face value per ticket,
// or what they paid for tickets they bought on resale.
async function holdersOf(eventId: string): Promise<Holder[]> {
  const drop = dropService.getRecord(eventId);
  if (!drop.issuanceId) return [];
  const list: Holder[] = [];
  for (const ctx of fanService.allContexts()) {
    const tickets = await xrplMpt.getTicketBalance(ctx.agent.address, drop.issuanceId).catch(() => 0);
    if (tickets <= 0) continue;
    const resalePaid = (state.history[ctx.id] ?? [])
      .filter((h) => h.eventId === eventId && h.kind === "resale_bought" && h.amountRlusd)
      .map((h) => Number(settleToZar(h.amountRlusd!)))
      .slice(-tickets);
    const refundZar = resalePaid.reduce((a, b) => a + b, 0) + (tickets - resalePaid.length) * drop.priceZar;
    list.push({ fanId: ctx.id, address: ctx.agent.address, tickets, refundZar });
  }
  return list;
}

// Cancelling is for events still selling (or sold out) that haven't started yet.
export function canCancel(drop: { state: string; startsAt: string }) {
  return (drop.state === "scheduled" || drop.state === "open" || drop.state === "sold_out") && new Date(drop.startsAt).getTime() > Date.now();
}

export async function cancelPreview(eventId: string) {
  const drop = dropService.getRecord(eventId);
  const holders = await holdersOf(eventId);
  const tickets = holders.reduce((n, h) => n + h.tickets, 0);
  const total = holders.reduce((n, h) => n + h.refundZar, 0);
  const face = tickets * drop.priceZar;
  return {
    holders: holders.length,
    tickets,
    faceZar: zar(Math.min(face, total)),
    resaleExtraZar: zar(Math.max(0, total - face)),
    totalZar: zar(total),
  };
}

// Stops sales straight away, then refunds every holder from the platform wallet in the
// background. Fans get an alert with the promoter's message. Tickets stop working at the door.
export async function cancelEvent(eventId: string, reason: string) {
  const drop = dropService.getRecord(eventId);
  if (drop.state === "cancelled") throw conflict("INVALID_STATE", "This event is already cancelled");
  if (!canCancel(drop)) throw conflict("INVALID_STATE", "Sales are closed for this event, so it can't be cancelled here");
  const holders = await holdersOf(eventId);
  const total = holders.reduce((n, h) => n + h.refundZar, 0);

  drop.state = "cancelled";
  drop.cancel = { reason, at: nowIso(), holders: holders.length, refunded: 0, totalZar: zar(total), refundedZar: "0.00", done: holders.length === 0 };
  for (const l of Object.values(state.listings)) {
    if (l.eventId === eventId && (l.status === "open" || l.status === "signing")) l.status = "refused";
  }
  for (const [k, m] of Object.entries(state.mandates)) {
    if (k.endsWith(`:${eventId}`) && m.status === "active") m.status = "cancelled";
  }
  touchDrop(drop.id);
  events.emit("drop.cancelled", `${drop.name} was cancelled. Refunding ${holders.length} fan(s).`, { eventId: drop.id });

  // Tell fans who were waiting but held no tickets.
  const told = new Set(holders.map((h) => h.fanId));
  for (const k of Object.keys(state.mandates)) {
    if (!k.endsWith(`:${eventId}`)) continue;
    const fanId = k.slice(0, -(eventId.length + 1));
    if (told.has(fanId)) continue;
    told.add(fanId);
    alerts.push(fanId, { kind: "cancelled", title: `${drop.name} is cancelled`, body: `${reason} Your agent has stopped. No money was taken.`, eventId });
  }

  void (async () => {
    for (const h of holders) {
      try {
        const amount = zarToSettle(h.refundZar);
        const paid = await xrplPayments.promoterPay({ to: h.address, amount, memo: { kind: "refund", reason: "event cancelled" } });
        if (paid.result !== "tesSUCCESS") throw new Error(paid.result);
        fanService.addHistory(h.fanId, {
          eventId,
          kind: "refund",
          description: `Refund: ${drop.name} was cancelled`,
          tickets: 0,
          amountRlusd: amount,
          txHash: paid.hash,
        });
        drop.cancel!.refunded += 1;
        drop.cancel!.refundedZar = zar(Number(drop.cancel!.refundedZar) + h.refundZar);
        alerts.push(h.fanId, {
          kind: "cancelled",
          title: `${drop.name} is cancelled`,
          body: `${reason} ${randText(h.refundZar)} is back in your wallet.`,
          eventId,
        });
      } catch (error) {
        console.error(`Refund to ${h.fanId} failed:`, error instanceof Error ? error.message : error);
      }
      touchDrop(drop.id);
    }
    drop.cancel!.done = true;
    touchDrop(drop.id);
    save();
  })();

  return dropService.toView(drop);
}
