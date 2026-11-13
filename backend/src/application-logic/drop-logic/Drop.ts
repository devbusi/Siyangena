import { DROP_DEFAULTS, type Drop as DropView, type PromoterStats } from "@drop/shared";
import { state, save, touchDrop, DropRecord, EventStats } from "../../lib/store";
import { ApiError, conflict, forbidden, notFound } from "../../lib/utils/errors";
import { newId, nowIso } from "../../lib/utils/ids";
import { zar, zarToSettle } from "../../lib/utils/money";
import { xrplMpt } from "../../xrpl/xrpl.mpt";
import { Events } from "../event-logic/Events";
import { alerts } from "../alert-logic/Alerts";

const events = new Events();

// Events made before reviews existed, or by the scripts, count as approved.
export const isApproved = (d: DropRecord) => !d.review || d.review.status === "approved";

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
      ...(record.cancel ? { cancel: record.cancel } : {}),
      ...(record.review ? { review: record.review } : {}),
      ...(record.category ? { category: record.category as DropView["category"] } : {}),
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

  // The public list hides cancelled events and events still in review. Promoters and admins see theirs.
  list(filter?: { promoterId?: string; includeCancelled?: boolean }): DropView[] {
    const forPublic = !filter?.includeCancelled;
    return Object.values(state.drops)
      .filter((d) => !filter?.promoterId || d.promoterId === filter.promoterId)
      .filter((d) => !forPublic || (d.state !== "cancelled" && isApproved(d)))
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
      category?: string;
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
      // A promoter's event waits for an admin. The scripts' events go straight up.
      ...(promoter ? { review: { status: "pending" as const, submittedAt: nowIso() } } : {}),
    };
    touchDrop(id);
    if (!promoter) alerts.onNewEvent(state.drops[id]);
    return this.toView(state.drops[id]);
  }

  // ---- Admin review of new events ----

  inReview(): DropView[] {
    return Object.values(state.drops)
      .filter((d) => d.review && d.review.status !== "approved" && d.state !== "cancelled")
      .sort((a, b) => (a.review!.submittedAt ?? "").localeCompare(b.review!.submittedAt ?? ""))
      .map((d) => this.toView(d));
  }

  reviewEvent(eventId: string, decision: "approved" | "needs_more", note?: string): DropView {
    const drop = this.getRecord(eventId);
    drop.review = { status: decision, ...(note ? { note } : {}), submittedAt: drop.review?.submittedAt ?? nowIso(), reviewedAt: nowIso() };
    touchDrop(drop.id);
    // Fans who wished for something like this hear about it once it's approved.
    if (decision === "approved") alerts.onNewEvent(drop);
    return this.toView(drop);
  }

  // While an event is in review the promoter can change any of its details. The ticket
  // supply was set on the ledger when the event was created, so it stays.
  editDetails(
    eventId: string,
    p: { name?: string; category?: string; venue?: string; city?: string; scene?: string; posterUrl?: string; startsAt?: string; priceZar?: number; maxPerFan?: number; resaleCapZar?: number; resaleFeePct?: number; resubmit?: boolean },
  ): DropView {
    const drop = this.getRecord(eventId);
    if (isApproved(drop)) throw conflict("INVALID_STATE", "This event is approved. Only the per-person limit, resale cap and fee can change now.");
    if (p.name !== undefined) drop.name = p.name;
    if (p.category !== undefined) drop.category = p.category;
    if (p.venue !== undefined) drop.venue = p.venue;
    if (p.city !== undefined) drop.city = p.city || undefined;
    if (p.scene !== undefined) drop.scene = p.scene || undefined;
    if (p.posterUrl !== undefined) drop.posterUrl = p.posterUrl || undefined;
    if (p.startsAt !== undefined) drop.startsAt = new Date(p.startsAt).toISOString();
    if (p.priceZar !== undefined) drop.priceZar = p.priceZar;
    if (p.maxPerFan !== undefined) drop.maxPerFan = p.maxPerFan;
    if (p.resaleCapZar !== undefined) drop.resaleCapZar = p.resaleCapZar;
    if (p.resaleFeePct !== undefined) drop.resaleFeePct = p.resaleFeePct;
    if (p.resubmit && drop.review?.status === "needs_more") drop.review = { status: "pending", submittedAt: nowIso() };
    touchDrop(drop.id);
    return this.toView(drop);
  }

  // The promoter fixed what was asked: back into the queue.
  resubmit(eventId: string): DropView {
    const drop = this.getRecord(eventId);
    if (drop.review?.status === "needs_more") {
      drop.review = { status: "pending", submittedAt: nowIso() };
      touchDrop(drop.id);
    }
    return this.toView(drop);
  }

  openDrop(eventId?: string): DropView {
    const drop = this.getRecord(eventId);
    if (drop.state === "open") return this.toView(drop);
    if (drop.state === "cancelled") throw conflict("INVALID_STATE", "This event was cancelled");
    if (!isApproved(drop)) throw conflict("IN_REVIEW", "This event is still being reviewed. Sales can open once it's approved.");
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
    if (drop.state === "cancelled") return this.toView(drop);
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
