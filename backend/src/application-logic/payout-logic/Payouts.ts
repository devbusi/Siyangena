import type { Payout, PayoutSummary } from "@drop/shared";
import { state, save } from "../../lib/store";
import { conflict, notFound } from "../../lib/utils/errors";
import { newId, nowIso } from "../../lib/utils/ids";
import { settleToZar, zar } from "../../lib/utils/money";
import { supabaseConfigured } from "../../lib/supabase";
import { accounts } from "../account-logic/Accounts";

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
    let earned = 0;
    let fees = 0;
    let held = 0;
    let refunded = 0;
    let resales = 0;
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
        earned += net;
        fees += fee;
        refunded += back;
        resales += s?.resales ?? 0;
        if (isHeld) held += net;
        return {
          eventId: d.id,
          name: d.name,
          startsAt: d.startsAt,
          state: d.state,
          salesZar: zar(sales),
          feesZar: zar(fee),
          refundedZar: zar(back),
          held: isHeld,
        };
      });
    const history = Object.values(state.payouts)
      .filter((p) => p.promoterId === promoterId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
      availableZar: zar(Math.max(0, earned - held - paid - requested)),
      refundedZar: zar(refunded),
      kind,
      ...(bank ? { bank } : {}),
      events: lines,
      history,
    };
  }

  async request(promoterId: string, promoterName: string): Promise<Payout> {
    const s = await this.summary(promoterId);
    const amount = Number(s.availableZar);
    if (amount <= 0) throw conflict("INVALID_STATE", "Nothing to pay out yet");
    const payout: Payout = {
      id: newId("payout"),
      promoterId,
      promoterName,
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

  markPaid(id: string): Payout {
    const p = state.payouts[id];
    if (!p) throw notFound("No such payout");
    p.status = "paid";
    p.paidAt = nowIso();
    save();
    return p;
  }
}
