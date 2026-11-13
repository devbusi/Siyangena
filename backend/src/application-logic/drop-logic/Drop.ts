import { DROP_DEFAULTS, type Drop as DropView, type PromoterStats } from "@drop/shared";
import { state, save, touchDrop, DropRecord, EventStats } from "../../lib/store";
import { ApiError, conflict, forbidden, notFound } from "../../lib/utils/errors";
import { newId, nowIso } from "../../lib/utils/ids";
import { zar, zarToSettle } from "../../lib/utils/money";
import { xrplMpt } from "../../xrpl/xrpl.mpt";
import { Events } from "../event-logic/Events";

const events = new Events();

// An event ("drop" in the code). Each event is its own MPT issuance, created by the
// platform wallet on behalf of the promoter, so tickets from different events never mix.
export class Drop {
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
      ...(record.city ? { city: record.city } : {}),
      ...(record.scene ? { scene: record.scene } : {}),
      ...(record.posterUrl ? { posterUrl: record.posterUrl } : {}),
      ...(record.promoterId ? { promoterId: record.promoterId } : {}),
      ...(record.promoterName ? { promoterName: record.promoterName } : {}),
    };
  }

  // The event shown when a caller does not name one: the newest one on sale, else the newest.
  featured(): DropRecord | null {
    const all = Object.values(state.drops).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    return all.find((d) => d.state === "open") ?? all.find((d) => d.state === "scheduled") ?? all[0] ?? null;
  }

  getRecord(eventId?: string): DropRecord {
    if (eventId) {
      const drop = state.drops[eventId];
      if (!drop) throw notFound(`Event ${eventId} not found`);
      return drop;
    }
    const drop = this.featured();
    if (!drop) {
      throw new ApiError(404, "NO_DROP", "No event exists yet. A promoter needs to create one.");
    }
    return drop;
  }

  getDrop(eventId?: string): DropView {
    return this.toView(this.getRecord(eventId));
  }

  list(filter?: { promoterId?: string }): DropView[] {
    return Object.values(state.drops)
      .filter((d) => !filter?.promoterId || d.promoterId === filter.promoterId)
      .filter((d) => d.state !== "cancelled")
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((d) => this.toView(d));
  }

  // Only the promoter who owns an event (or an admin) can run it.
  assertOwner(eventId: string, actor: { id: string; isAdmin: boolean }) {
    const drop = this.getRecord(eventId);
    if (!actor.isAdmin && drop.promoterId !== actor.id) throw forbidden("UNAUTHORIZED", "This isn't your event");
    return drop;
  }

  // If setup.ts already created an issuance (ISSUANCE_ID in .env), start with the demo event.
  seedFromEnv() {
    const issuanceId = process.env.ISSUANCE_ID;
    if (!issuanceId || Object.values(state.drops).some((d) => d.issuanceId === issuanceId)) return;
    const id = newId("drop");
    state.drops[id] = {
      id,
      ...DROP_DEFAULTS,
      city: "Cape Town",
      scene: "longstreet",
      promoterName: "Sunset Sessions",
      state: "scheduled",
      sold: 0,
      issuanceId,
      createdAt: nowIso(),
    };
    touchDrop(id);
    console.log(`Seeded demo event from ISSUANCE_ID ${issuanceId}`);
  }

  // Creates the MPT issuance on the ledger, then the event.
  async createDrop(
    params: {
      name: string;
      venue: string;
      city?: string;
      scene?: string;
      posterUrl?: string;
      startsAt: string;
      priceZar: number;
      supply: number;
      maxPerFan: number;
      resaleCapZar: number;
      resaleFeePct: number;
    },
    promoter?: { id: string; name: string },
  ): Promise<DropView> {
    const { issuanceId, txHash } = await xrplMpt.createIssuance({
      supply: params.supply,
      name: params.name,
      venue: params.venue,
      startsAt: params.startsAt,
      promoterName: promoter?.name,
    });

    const id = newId("drop");
    state.drops[id] = {
      id,
      ...params,
      ...(promoter ? { promoterId: promoter.id, promoterName: promoter.name } : {}),
      state: "scheduled",
      sold: 0,
      issuanceId,
      issuanceTx: txHash,
      createdAt: nowIso(),
    };
    touchDrop(id);
    return this.toView(state.drops[id]);
  }

  openDrop(eventId?: string): DropView {
    const drop = this.getRecord(eventId);
    if (drop.state === "open") return this.toView(drop);
    if (drop.state === "cancelled") throw conflict("INVALID_STATE", "This event was cancelled");
    if (drop.sold >= drop.supply) throw conflict("SOLD_OUT", "This event is sold out");
    drop.state = "open";
    touchDrop(drop.id);
    events.emit("drop.opened", `Sales opened for ${drop.name}: ${drop.supply - drop.sold} tickets at R${zar(drop.priceZar)}`, {
      eventId: drop.id,
    });
    return this.toView(drop);
  }

  closeDrop(eventId?: string): DropView {
    const drop = this.getRecord(eventId);
    drop.state = "closed";
    touchDrop(drop.id);
    return this.toView(drop);
  }

  // The promoter decides the resale cap, the fee and how many tickets one fan may hold.
  updateDrop(
    params: { resaleCapZar?: number; resaleFeePct?: number; maxPerFan?: number },
    eventId?: string,
  ): DropView {
    const drop = this.getRecord(eventId);
    if (params.maxPerFan !== undefined) drop.maxPerFan = params.maxPerFan;
    if (params.resaleCapZar !== undefined) drop.resaleCapZar = params.resaleCapZar;
    if (params.resaleFeePct !== undefined) drop.resaleFeePct = params.resaleFeePct;
    touchDrop(drop.id);
    return this.toView(drop);
  }

  // Called once tickets are on their way to a buyer.
  markSold(eventId: string, quantity: number) {
    const drop = this.getRecord(eventId);
    drop.sold += quantity;
    if (drop.sold >= drop.supply && drop.state === "open") {
      drop.state = "sold_out";
      events.emit("drop.sold_out", `${drop.name} is sold out`, { eventId: drop.id });
    }
    touchDrop(drop.id);
  }

  // Undo markSold if the ticket transfer failed.
  unmarkSold(eventId: string, quantity: number) {
    const drop = this.getRecord(eventId);
    drop.sold = Math.max(0, drop.sold - quantity);
    if (drop.state === "sold_out" && drop.sold < drop.supply) drop.state = "open";
    touchDrop(drop.id);
  }

  statsFor(eventId: string): EventStats {
    return (state.stats[eventId] ??= { revenueRlusd: "0", resales: 0, feesRlusd: "0" });
  }

  getStats(eventId?: string): PromoterStats {
    const drop = this.getRecord(eventId);
    const s = this.statsFor(drop.id);
    save();
    return { sold: drop.sold, revenueRlusd: s.revenueRlusd, resales: s.resales, feesRlusd: s.feesRlusd };
  }
}
