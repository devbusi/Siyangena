import { GlobalFlags } from "xrpl";
import { SALE_INTENT_TTL_MS, decodeDropMemo, encodeDropMemo, type SaleIntent } from "@drop/shared";
import { state, save, IntentRecord } from "../../lib/store";
import { conflict, forbidden } from "../../lib/utils/errors";
import { newId, nowIso } from "../../lib/utils/ids";
import { addAmounts, sameAmount, zarToSettle } from "../../lib/utils/money";
import { xrplClient } from "../../xrpl/xrpl.client";
import { xrplConfig } from "../../xrpl/xrpl.config";
import { xrplWallet } from "../../xrpl/xrpl.wallet";
import { xrplMpt } from "../../xrpl/xrpl.mpt";
import { xrplPayments } from "../../xrpl/xrpl.payments";
import { readSettleAmount, settleAmount } from "../../xrpl/xrpl.amounts";
import { Drop } from "../drop-logic/Drop";
import { Fans } from "../fan-logic/Fans";
import { Mandates } from "../mandate-logic/Mandates";
import { Events } from "../event-logic/Events";

const dropService = new Drop();
const fanService = new Fans();
const mandateService = new Mandates();
const events = new Events();

// Last ledger the watcher saw, so a reconnect can catch up on what it missed.
let lastSeenLedger = 0;

export class Sales {
  private expireIntents() {
    const now = Date.now();
    for (const intent of Object.values(state.intents)) {
      if (intent.status === "pending" && Date.parse(intent.expiresAt) < now) {
        intent.status = "expired";
      }
    }
  }

  private pending(): IntentRecord[] {
    this.expireIntents();
    return Object.values(state.intents).filter((i) => i.status === "pending");
  }

  // Step 1 of a primary purchase. Every service rule is checked here; the agent then
  // submits the Payment itself with the returned memo.
  // Buying directly in the app (manual) skips the agent's limits: the human is choosing.
  async createIntent(fanId: string, quantity: number, eventId?: string, opts: { manual?: boolean } = {}): Promise<SaleIntent> {
    const drop = dropService.getRecord(eventId);
    fanService.getContext(fanId);

    if (drop.state === "sold_out") throw conflict("SOLD_OUT", "This event is sold out");
    if (drop.state !== "open") throw conflict("NOT_OPEN", `Sales are ${drop.state === "scheduled" ? "not open yet" : drop.state}`);

    fanService.assertVerified(fanId);
    const mandateId = opts.manual ? "manual" : mandateService.assertWithinMandate(fanId, quantity, drop.priceZar, drop.id).id;

    const pending = this.pending().filter((i) => i.eventId === drop.id);
    const fanPending = pending.filter((i) => i.fanId === fanId).reduce((n, i) => n + i.quantity, 0);
    const held = await fanService.getTicketCount(fanId, drop.id);
    if (held + fanPending + quantity > drop.maxPerFan) {
      const message = `${fanId}: max ${drop.maxPerFan} per fan (holds ${held}, pending ${fanPending}, asked ${quantity})`;
      events.emit("mandate.blocked", message, { fanId, eventId: drop.id });
      throw forbidden("LIMIT_PER_FAN", message);
    }

    // The wallet must be allowed to hold this event's tickets before the promoter sends them.
    await fanService.ensureEventAccess(fanId, drop.id);

    const reserved = pending.reduce((n, i) => n + i.quantity, 0);
    if (drop.sold + reserved + quantity > drop.supply) {
      throw conflict("SOLD_OUT", `Only ${Math.max(0, drop.supply - drop.sold - reserved)} ticket(s) left`);
    }

    const intent: IntentRecord = {
      requestId: newId("req"),
      eventId: drop.id,
      fanId,
      mandateId,
      quantity,
      amountRlusd: zarToSettle(drop.priceZar * quantity),
      status: "pending",
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + SALE_INTENT_TTL_MS).toISOString(),
    };
    state.intents[intent.requestId] = intent;
    save();

    events.emit("sale.intent", `${fanId} asked for ${quantity} ticket(s): pay ${intent.amountRlusd} ${xrplConfig.settleAsset}`, {
      fanId,
      eventId: drop.id,
    });

    return {
      requestId: intent.requestId,
      payTo: xrplWallet.getPromoterWallet().address,
      amountRlusd: intent.amountRlusd,
      memo: { kind: "sale", requestId: intent.requestId, mandateId },
      expiresAt: intent.expiresAt,
    };
  }

  // Buy in the app with no agent: the server pays from the fan's own wallet (it holds the
  // key for real accounts), then the watcher sends the tickets as for any other sale.
  async buyNow(fanId: string, quantity: number, eventId: string) {
    const ctx = fanService.getContext(fanId);
    const intent = await this.createIntent(fanId, quantity, eventId, { manual: true });
    const balance = Number(await xrplPayments.getSettleBalance(ctx.agent.address));
    if (balance + 1e-9 < Number(intent.amountRlusd)) {
      state.intents[intent.requestId].status = "expired";
      save();
      throw conflict("INVALID_STATE", "Not enough money in your Siyangena wallet. Top up and try again.");
    }
    const paid = await xrplClient.submitTx(ctx.agent, {
      TransactionType: "Payment",
      Account: ctx.agent.address,
      Destination: intent.payTo,
      Amount: settleAmount(intent.amountRlusd),
      Memos: encodeDropMemo(intent.memo),
    });
    if (paid.result !== "tesSUCCESS") {
      state.intents[intent.requestId].status = "expired";
      save();
      throw conflict("INVALID_STATE", `Payment did not go through (${paid.result})`);
    }
    return { requestId: intent.requestId, paymentTx: paid.hash, quantity, eventId };
  }

  intentStatus(requestId: string) {
    const intent = state.intents[requestId];
    return intent ? { status: intent.status, ticketTx: intent.ticketTx, paymentTx: intent.paymentTx } : null;
  }

  // ---- Watcher: subscribe to the promoter account, match memo, send tickets or refund ----

  async startWatcher() {
    if (!xrplConfig.hasPromoter()) {
      console.warn("PROMOTER_SEED not set: sale watcher not started");
      return;
    }
    const promoter = xrplWallet.getPromoterWallet().address;
    const client = xrplClient.getClient();

    client.on("transaction", (ev: any) => {
      this.handleStreamTx(ev).catch((error) => console.error("Sale watcher error:", error));
    });

    const subscribe = async (catchUp: boolean) => {
      await client.request({ command: "subscribe", accounts: [promoter] });
      if (catchUp && lastSeenLedger > 0) await this.catchUp(promoter);
    };
    client.on("connected", () => {
      subscribe(true).catch((error) => console.error("Resubscribe failed:", error));
    });

    await xrplClient.ensureConnected();
    await subscribe(false);
    lastSeenLedger = await xrplClient.getLedgerIndex();
    console.log(`Sale watcher subscribed to promoter ${promoter} on ${xrplConfig.network}`);
  }

  // After a reconnect, process anything that landed while we were away.
  private async catchUp(promoter: string) {
    const res: any = await xrplClient.getClient().request({
      command: "account_tx",
      account: promoter,
      ledger_index_min: lastSeenLedger,
      ledger_index_max: -1,
      forward: true,
    });
    for (const t of res.result.transactions) {
      await this.handleStreamTx({ ...t, tx_json: t.tx_json ?? t.tx, validated: t.validated });
    }
  }

  private async handleStreamTx(ev: any) {
    if (!ev.validated) return;
    const tx = ev.tx_json ?? ev.transaction;
    const hash: string = ev.hash ?? tx?.hash;
    const meta = ev.meta;
    if (!tx || !hash || !meta) return;
    if (ev.ledger_index) lastSeenLedger = Math.max(lastSeenLedger, ev.ledger_index);

    if (state.processedTx.includes(hash)) return;
    state.processedTx.push(hash);
    save();

    const promoter = xrplWallet.getPromoterWallet().address;
    if (tx.TransactionType !== "Payment" || tx.Destination !== promoter || tx.Account === promoter) return;
    // Resale Batch legs are settled by the resale flow, not here.
    if ((tx.Flags ?? 0) & GlobalFlags.tfInnerBatchTxn) return;
    if (meta.TransactionResult !== "tesSUCCESS") return;

    const delivered = readSettleAmount(meta.delivered_amount);
    if (delivered === null) return; // tickets returned, other assets: not a sale

    await this.handlePayment({ hash, from: tx.Account, amount: delivered, memos: tx.Memos });
  }

  private async handlePayment(p: { hash: string; from: string; amount: string; memos: any }) {
    const memo = decodeDropMemo(p.memos);
    const fan = fanService.findByAgentAddress(p.from);

    // Plain payments with no Drop memo from outside the cast (faucet, bank top-ups) are ignored.
    if (!memo && !fan) return;

    const refund = async (reason: string, requestId?: string) => {
      const result = await xrplPayments.promoterPay({
        to: p.from,
        amount: p.amount,
        memo: { kind: "refund", requestId, reason },
      });
      if (requestId && state.intents[requestId]) state.intents[requestId].status = "refunded";
      save();
      events.emit("sale.refunded", `Refunded ${p.amount} ${xrplConfig.settleAsset} to ${fan?.id ?? p.from}: ${reason}`, {
        fanId: fan?.id,
        eventId: requestId ? state.intents[requestId]?.eventId : undefined,
        txHash: result.hash,
      });
      if (fan) {
        fanService.addHistory(fan.id, {
          kind: "refund",
          description: `Refund: ${reason}`,
          tickets: 0,
          amountRlusd: p.amount,
          txHash: result.hash,
        });
      }
    };

    const intent = memo?.kind === "sale" && memo.requestId ? state.intents[memo.requestId] : undefined;
    if (!intent) return refund("payment does not match a sale intent", memo?.requestId);
    if (intent.status !== "pending" && intent.status !== "expired") {
      return refund(`intent already ${intent.status}`, intent.requestId);
    }
    const intentFan = fanService.getContext(intent.fanId);
    if (intentFan.agent.address !== p.from) return refund("paid from the wrong account", intent.requestId);
    if (!sameAmount(p.amount, intent.amountRlusd)) {
      return refund(`expected ${intent.amountRlusd}, got ${p.amount}`, intent.requestId);
    }

    const drop = dropService.getRecord(intent.eventId);
    if (drop.sold + intent.quantity > drop.supply) return refund("sold out", intent.requestId);

    intent.status = "paid";
    intent.paymentTx = p.hash;
    save();
    events.emit("sale.paid", `${intent.fanId} paid ${p.amount} ${xrplConfig.settleAsset} for ${intent.quantity} ticket(s)`, {
      fanId: intent.fanId,
      eventId: drop.id,
      txHash: p.hash,
    });
    fanService.addHistory(intent.fanId, {
      eventId: drop.id,
      kind: "primary_purchase",
      description: `Paid for ${intent.quantity} ticket(s)`,
      tickets: 0,
      amountRlusd: p.amount,
      txHash: p.hash,
    });

    // Reserve supply before the await so concurrent payments can't oversell.
    dropService.markSold(drop.id, intent.quantity);
    const sent = await xrplMpt.sendTickets({
      to: intentFan.agent.address,
      issuanceId: drop.issuanceId,
      quantity: intent.quantity,
      memo: { kind: "ticket", requestId: intent.requestId, mandateId: intent.mandateId },
    });

    if (sent.result !== "tesSUCCESS") {
      dropService.unmarkSold(drop.id, intent.quantity);
      events.emit("ledger.rejected", `Ticket transfer to ${intent.fanId} failed: ${sent.result}`, {
        fanId: intent.fanId,
        eventId: drop.id,
        txHash: sent.hash,
      });
      intent.status = "pending"; // let refund() mark it refunded
      return refund(`ticket transfer failed (${sent.result})`, intent.requestId);
    }

    intent.status = "fulfilled";
    intent.ticketTx = sent.hash;
    if (intent.mandateId !== "manual") mandateService.recordPurchase(intent.fanId, intent.quantity, drop.id);
    const stats = dropService.statsFor(drop.id);
    stats.revenueRlusd = addAmounts(stats.revenueRlusd, p.amount);
    save();

    events.emit("sale.ticket_sent", `Sent ${intent.quantity} ticket(s) to ${intent.fanId}`, {
      fanId: intent.fanId,
      eventId: drop.id,
      txHash: sent.hash,
    });
    fanService.addHistory(intent.fanId, {
      eventId: drop.id,
      kind: "ticket_received",
      description: `Received ${intent.quantity} ticket(s) from the promoter`,
      tickets: intent.quantity,
      txHash: sent.hash,
    });
  }
}
