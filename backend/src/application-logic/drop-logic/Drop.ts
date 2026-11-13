import { DROP_DEFAULTS, type Drop as DropView, type PromoterStats } from "@drop/shared";
import { state, save, DropRecord } from "../../lib/store";
import { ApiError, conflict } from "../../lib/utils/errors";
import { newId } from "../../lib/utils/ids";
import { zar, zarToSettle } from "../../lib/utils/money";
import { xrplMpt } from "../../xrpl/xrpl.mpt";
import { Events } from "../event-logic/Events";

const events = new Events();

export class Drop {
  // Map the stored record to the API shape (money as strings).
  toView(record: DropRecord): DropView {
    return {
      id: record.id,
      name: record.name,
      venue: record.venue,
      startsAt: record.startsAt,
      state: record.state,
      priceZar: zar(record.priceZar),
      priceRlusd: zarToSettle(record.priceZar),
      supply: record.supply,
      sold: record.sold,
      maxPerFan: record.maxPerFan,
      resaleCapZar: zar(record.resaleCapZar),
      resaleFeePct: record.resaleFeePct,
      issuanceId: record.issuanceId,
      ...(record.issuanceTx ? { issuanceTx: record.issuanceTx } : {}),
    };
  }

  getRecord(): DropRecord {
    if (!state.drop) {
      throw new ApiError(404, "NO_DROP", "No drop exists yet. Create one with POST /api/promoter/drop.");
    }
    return state.drop;
  }

  getDrop(): DropView {
    return this.toView(this.getRecord());
  }

  // If setup.ts already created an issuance (ISSUANCE_ID in .env), start with the demo drop.
  seedFromEnv() {
    const issuanceId = process.env.ISSUANCE_ID;
    if (state.drop || !issuanceId) return;
    state.drop = {
      id: newId("drop"),
      ...DROP_DEFAULTS,
      state: "scheduled",
      sold: 0,
      issuanceId,
    };
    save();
    console.log(`Seeded demo drop from ISSUANCE_ID ${issuanceId}`);
  }

  // Creates the MPT issuance on the ledger, then replaces the current drop.
  async createDrop(params: {
    name: string;
    venue: string;
    startsAt: string;
    priceZar: number;
    supply: number;
    maxPerFan: number;
    resaleCapZar: number;
    resaleFeePct: number;
  }): Promise<DropView> {
    const { issuanceId, txHash } = await xrplMpt.createIssuance({
      supply: params.supply,
      name: params.name,
      venue: params.venue,
      startsAt: params.startsAt,
    });

    state.drop = {
      id: newId("drop"),
      ...params,
      state: "scheduled",
      sold: 0,
      issuanceId,
      issuanceTx: txHash,
    };

    // A new issuance means new authorisations, purchases and listings.
    for (const fan of Object.values(state.fans)) {
      fan.verified = false;
      fan.authTx = undefined;
    }
    for (const mandate of Object.values(state.mandates)) {
      mandate.bought = 0;
      if (mandate.status === "filled") mandate.status = "active";
    }
    state.intents = {};
    state.listings = {};
    state.batches = {};
    state.stats = { revenueRlusd: "0", resales: 0, feesRlusd: "0" };
    save();

    return this.toView(state.drop);
  }

  openDrop(): DropView {
    const drop = this.getRecord();
    if (drop.state === "open") return this.toView(drop);
    if (drop.sold >= drop.supply) {
      throw conflict("SOLD_OUT", "Drop is sold out");
    }
    drop.state = "open";
    save();
    events.emit("drop.opened", `${drop.name} is open: ${drop.supply - drop.sold} tickets at R${zar(drop.priceZar)}`);
    return this.toView(drop);
  }

  closeDrop(): DropView {
    const drop = this.getRecord();
    drop.state = "closed";
    save();
    return this.toView(drop);
  }

  updateDrop(params: { resaleCapZar?: number; resaleFeePct?: number }): DropView {
    const drop = this.getRecord();
    if (params.resaleCapZar !== undefined) drop.resaleCapZar = params.resaleCapZar;
    if (params.resaleFeePct !== undefined) drop.resaleFeePct = params.resaleFeePct;
    save();
    return this.toView(drop);
  }

  // Called once tickets are on their way to a buyer.
  markSold(quantity: number) {
    const drop = this.getRecord();
    drop.sold += quantity;
    if (drop.sold >= drop.supply && drop.state === "open") {
      drop.state = "sold_out";
      events.emit("drop.sold_out", `${drop.name} is sold out`);
    }
    save();
  }

  // Undo markSold if the ticket transfer failed.
  unmarkSold(quantity: number) {
    const drop = this.getRecord();
    drop.sold = Math.max(0, drop.sold - quantity);
    if (drop.state === "sold_out" && drop.sold < drop.supply) drop.state = "open";
    save();
  }

  getStats(): PromoterStats {
    return {
      sold: state.drop?.sold ?? 0,
      revenueRlusd: state.stats.revenueRlusd,
      resales: state.stats.resales,
      feesRlusd: state.stats.feesRlusd,
    };
  }
}
