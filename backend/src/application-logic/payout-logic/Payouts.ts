import type { Payout, PayoutSummary } from "@drop/shared";
import { state, save } from "../../lib/store";
import { conflict, notFound } from "../../lib/utils/errors";
import { newId, nowIso } from "../../lib/utils/ids";
import { settleToZar, zar } from "../../lib/utils/money";
import { supabaseConfigured } from "../../lib/supabase";
import { accounts } from "../account-logic/Accounts";
import { Money } from "../money-logic/Money";
import { xrplExplorer } from "../../xrpl/xrpl.explorer";

const money = new Money();

const DAY = 24 * 60 * 60 * 1000;

// Only the last four digits of a bank account are ever shown.
function maskBank(details?: string): string | undefined {
  if (!details) return undefined;
  const digits = details.replace(/\D/g, "");
  const bank = details.replace(/[\d\s,:-]+/g, " ").trim().split(/\s+/)[0];
  return digits.length >= 4 ? `${bank ? `${bank}, ` : ""}account ending ${digits.slice(-4)}` : details;
}

// Promoters earn ticket sales and the resale fee they set, less refunds.
// Registered businesses can be paid as tickets sell. Independent promoters are paid the
// morning after the event, so fans can be refunded if it doesn't happen.
export class Payouts {
  async summary(promoterId: string): Promise<PayoutSummary> {
    const application = supabaseConfigured() ? await accounts.getApplication(promoterId).catch(() => undefined) : undefined;
    const kind = application?.kind ?? "independent";
    const now = Date.now();
    const history = Object.values(state.payouts)
      .filter((p) => p.promoterId === promoterId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    let earned = 0;
    let fees = 0;
    let held = 0;
    let refunded = 0;
    let resales = 0;
    let available = 0;
    const lines = Object.values(state.drops)
      .filter((d) => d.promoterId === promoterId)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .map((d) => {
        const s = state.stats[d.id];
        const sales = Number(settleToZar(s?.revenueRlusd ?? "0"));
        const fee = Number(settleToZar(s?.feesRlusd ?? "0"));
        const back = Number(d.cancel?.refundedZar ?? 0);
        const net = Math.max(0, sales + fee - back);
        const isHeld = kind === "independent" && d.state !== "cancelled" && new Date(d.startsAt).getTime() + DAY > now;
        const mine = history.filter((p) => p.eventId === d.id);
        const paidE = mine.filter((p) => p.status === "paid").reduce((n, p) => n + Number(p.amountZar), 0);
        const requestedE = mine.filter((p) => p.status === "requested").reduce((n, p) => n + Number(p.amountZar), 0);
        const availableE = isHeld ? 0 : Math.max(0, net - paidE - requestedE);
        earned += net;
        fees += fee;
        refunded += back;
        resales += s?.resales ?? 0;
        available += availableE;
        if (isHeld) held += Math.max(0, net - paidE - requestedE);
        return {
          eventId: d.id,
          name: d.name,
          startsAt: d.startsAt,
          state: d.state,
          salesZar: zar(sales),
          feesZar: zar(fee),
          refundedZar: zar(back),
          held: isHeld,
          netZar: zar(net),
          requestedZar: zar(requestedE),
          paidZar: zar(paidE),
          availableZar: zar(availableE),
        };
      });
    const paid = history.filter((p) => p.status === "paid").reduce((n, p) => n + Number(p.amountZar), 0);
    const requested = history.filter((p) => p.status === "requested").reduce((n, p) => n + Number(p.amountZar), 0);
    const bank = maskBank(application?.payoutDetails);
    return {
      earnedZar: zar(earned),
      feesZar: zar(fees),
      resales,
      heldZar: zar(held),
      paidZar: zar(paid),
      requestedZar: zar(requested),
      availableZar: zar(available),
      refundedZar: zar(refunded),
      kind,
      ...(bank ? { bank } : {}),
      events: lines,
      history,
    };
  }

  // One payout per event: everything that event has earned and isn't paid or on its way.
  async request(promoterId: string, promoterName: string, eventId: string): Promise<Payout> {
    const s = await this.summary(promoterId);
    const line = s.events.find((e) => e.eventId === eventId);
    if (!line) throw notFound("That isn't one of your events");
    if (line.held) throw conflict("INVALID_STATE", "This event's money is held until the morning after the event");
    const amount = Number(line.availableZar);
    if (amount <= 0) throw conflict("INVALID_STATE", "Nothing to pay out for this event yet");
    const payout: Payout = {
      id: newId("payout"),
      promoterId,
      promoterName,
      eventId,
      eventName: line.name,
      amountZar: zar(amount),
      status: "requested",
      ...(s.bank ? { bank: s.bank } : {}),
      createdAt: nowIso(),
    };
    state.payouts[payout.id] = payout;
    save();
    return payout;
  }

  all(): Payout[] {
    return Object.values(state.payouts).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // The admin sends it: the money moves from the platform wallet to the bank wallet on the
  // ledger, then the (simulated) bank transfer to the promoter gets its reference.
  async markPaid(id: string): Promise<Payout> {
    const p = state.payouts[id];
    if (!p) throw notFound("No such payout");
    if (p.status === "paid") return p;
    const moved = await money.payoutToBank(Number(p.amountZar));
    p.status = "paid";
    p.paidAt = nowIso();
    p.txHash = moved.hash;
    p.explorerUrl = xrplExplorer.transactionUrl(moved.hash);
    p.reference = moved.reference;
    save();
    return p;
  }
}
