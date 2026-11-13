import { BATCH_SIGNING_TTL_MS, type AcceptListingResponse, type Listing, type ResaleBatchView, type SubmitSignatureResponse } from "@drop/shared";
import { Batch } from "xrpl";
import { state, save, BatchRecord, ListingRecord } from "../../lib/store";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../../lib/utils/errors";
import { newId, nowIso } from "../../lib/utils/ids";
import { addAmounts, zar, zarToSettle } from "../../lib/utils/money";
import { xrplClient } from "../../xrpl/xrpl.client";
import { xrplBatch } from "../../xrpl/xrpl.batch";
import { xrplExplorer } from "../../xrpl/xrpl.explorer";
import { Drop } from "../drop-logic/Drop";
import { Fans } from "../fan-logic/Fans";
import { Mandates } from "../mandate-logic/Mandates";
import { Events } from "../event-logic/Events";

const dropService = new Drop();
const fanService = new Fans();
const mandateService = new Mandates();
const events = new Events();

// In-memory only: the promoter Sequence lock and expiry timer for each Batch being signed.
const inFlight = new Map<string, { release: () => void; timer: NodeJS.Timeout }>();

export class Resale {
  private toView(record: ListingRecord): Listing {
    const { createdAt: _createdAt, ...listing } = record;
    return listing;
  }

  private getListingRecord(listingId: string): ListingRecord {
    const listing = state.listings[listingId];
    if (!listing) throw notFound(`Listing ${listingId} not found`);
    return listing;
  }

  private getBatchRecord(batchId: string): BatchRecord {
    const batch = state.batches[batchId];
    if (!batch) throw notFound(`Batch ${batchId} not found`);
    return batch;
  }

  listListings(): Listing[] {
    return Object.values(state.listings)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((l) => this.toView(l));
  }

  // The seller's agent lists one ticket. Listings over the cap are accepted here but the
  // promoter refuses to co-sign them, so they can never reach the ledger.
  async createListing(fanId: string, priceZar: number): Promise<Listing> {
    const drop = dropService.getRecord();
    fanService.getContext(fanId);
    fanService.assertVerified(fanId);

    const held = await fanService.getTicketCount(fanId);
    const alreadyListed = Object.values(state.listings).filter(
      (l) => l.sellerFanId === fanId && (l.status === "open" || l.status === "signing"),
    ).length;
    if (held - alreadyListed < 1) {
      throw forbidden("NO_TICKET", `${fanId} has no unlisted ticket (holds ${held}, listed ${alreadyListed})`);
    }

    const fee = (priceZar * drop.resaleFeePct) / 100;
    const listing: ListingRecord = {
      id: newId("listing"),
      sellerFanId: fanId,
      priceZar: zar(priceZar),
      feeZar: zar(fee),
      totalZar: zar(priceZar + fee),
      status: "open",
      createdAt: nowIso(),
    };
    state.listings[listing.id] = listing;
    save();

    const overCap = priceZar > drop.resaleCapZar;
    events.emit(
      "resale.listed",
      `${fanId} listed a ticket at R${listing.priceZar} (+R${listing.feeZar} fee)` +
        (overCap ? `: over the R${zar(drop.resaleCapZar)} cap, promoter will not co-sign` : ""),
      { fanId, listingId: listing.id },
    );
    return this.toView(listing);
  }

  // Buyer's agent accepts. Checks the promoter's cap and the buyer's mandate, then builds
  // the Batch while holding the promoter queue so its Sequence can't go stale.
  async acceptListing(listingId: string, buyerFanId: string): Promise<AcceptListingResponse> {
    const drop = dropService.getRecord();
    const listing = this.getListingRecord(listingId);
    if (listing.status !== "open") throw conflict("INVALID_STATE", `Listing is ${listing.status}`);
    if (listing.sellerFanId === buyerFanId) throw badRequest("INVALID_STATE", "Seller cannot buy their own listing");

    const seller = fanService.getContext(listing.sellerFanId);
    const buyer = fanService.getContext(buyerFanId);
    fanService.assertVerified(buyerFanId);

    if (Number(listing.priceZar) > drop.resaleCapZar) {
      listing.status = "refused";
      save();
      const message = `Promoter refused to co-sign: R${listing.priceZar} is over the R${zar(drop.resaleCapZar)} resale cap`;
      events.emit("resale.refused", message, { fanId: buyerFanId, listingId });
      throw forbidden("CAP_EXCEEDED", message);
    }

    mandateService.assertWithinMandate(buyerFanId, 1, Number(listing.totalZar));

    const buyerHeld = await fanService.getTicketCount(buyerFanId);
    if (buyerHeld + 1 > drop.maxPerFan) {
      const message = `${buyerFanId}: max ${drop.maxPerFan} per fan (holds ${buyerHeld})`;
      events.emit("mandate.blocked", message, { fanId: buyerFanId });
      throw forbidden("LIMIT_PER_FAN", message);
    }

    // Claim the listing before waiting on the queue so two buyers can't both get it.
    listing.status = "signing";
    listing.buyerFanId = buyerFanId;
    save();

    const release = await xrplClient.promoterQueue.acquire();
    let batch: Batch;
    try {
      batch = await xrplBatch.buildResaleBatch({
        seller: seller.agent.address,
        buyer: buyer.agent.address,
        issuanceId: drop.issuanceId,
        priceRlusd: zarToSettle(Number(listing.priceZar)),
        feeRlusd: zarToSettle(Number(listing.feeZar)),
        listingId,
      });
    } catch (error) {
      release();
      listing.status = "open";
      listing.buyerFanId = undefined;
      save();
      throw error;
    }

    const record: BatchRecord = {
      batchId: newId("batch"),
      listingId,
      sellerFanId: seller.id,
      buyerFanId,
      status: "awaiting_signatures",
      batch: batch as unknown as Record<string, unknown>,
      signatures: {},
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + BATCH_SIGNING_TTL_MS).toISOString(),
    };
    state.batches[record.batchId] = record;
    listing.batchId = record.batchId;
    save();

    const timer = setTimeout(() => this.expireBatch(record.batchId), BATCH_SIGNING_TTL_MS);
    inFlight.set(record.batchId, { release, timer });

    events.emit("resale.sign_requested", `${seller.id} and ${buyerFanId} to sign resale Batch for R${listing.totalZar}`, {
      fanId: seller.id,
      listingId,
      batchId: record.batchId,
    });

    return { batchId: record.batchId, batch: record.batch };
  }

  private finish(batchId: string) {
    const lock = inFlight.get(batchId);
    if (!lock) return;
    clearTimeout(lock.timer);
    lock.release();
    inFlight.delete(batchId);
  }

  private expireBatch(batchId: string) {
    const record = state.batches[batchId];
    if (!record || record.status !== "awaiting_signatures") return;
    record.status = "expired";
    const listing = state.listings[record.listingId];
    if (listing) {
      listing.status = "open";
      listing.buyerFanId = undefined;
      listing.batchId = undefined;
    }
    save();
    this.finish(batchId);
    events.emit("resale.refused", `Resale Batch expired before both agents signed`, {
      listingId: record.listingId,
      batchId,
    });
  }

  getBatch(batchId: string): ResaleBatchView {
    const record = this.getBatchRecord(batchId);
    return {
      batchId: record.batchId,
      listingId: record.listingId,
      sellerFanId: record.sellerFanId,
      buyerFanId: record.buyerFanId,
      status: record.status,
      batch: record.batch,
      signedBy: Object.keys(record.signatures),
      expiresAt: record.expiresAt,
    };
  }

  async submitSignature(
    batchId: string,
    fanId: string,
    signedBatch: Record<string, unknown> | string,
  ): Promise<SubmitSignatureResponse> {
    const record = this.getBatchRecord(batchId);
    if (record.status !== "awaiting_signatures") {
      throw conflict("INVALID_STATE", `Batch is ${record.status}`);
    }
    if (fanId !== record.sellerFanId && fanId !== record.buyerFanId) {
      throw forbidden("INVALID_SIGNATURE", `${fanId} is not a party to this Batch`);
    }

    const signer = fanService.getContext(fanId);
    const check = xrplBatch.checkSignedBatch(record.batch, signedBatch, signer.agent.address);
    if (!check.ok) throw badRequest("INVALID_SIGNATURE", check.reason);

    record.signatures[fanId] = check.batch as unknown as Record<string, unknown>;
    save();

    const waitingFor = [record.sellerFanId, record.buyerFanId].filter((id) => !record.signatures[id]);
    if (waitingFor.length > 0) {
      return { status: "awaiting_signatures", waitingFor };
    }

    // Both signed. Claim it synchronously so a concurrent request can't submit twice.
    record.status = "submitted";
    save();

    const listing = this.getListingRecord(record.listingId);
    const drop = dropService.getRecord();

    try {
      // The promoter checks the cap again (it may have been lowered) and signs last.
      if (Number(listing.priceZar) > drop.resaleCapZar) {
        record.status = "refused";
        listing.status = "refused";
        save();
        events.emit("resale.refused", `Promoter refused to co-sign: R${listing.priceZar} is over the cap`, {
          listingId: listing.id,
          batchId,
        });
        return { status: "refused" };
      }

      const signedCopies = [record.sellerFanId, record.buyerFanId].map(
        (id) => record.signatures[id] as unknown as Batch,
      );
      const outer = await xrplBatch.submitResaleBatch(signedCopies);
      record.txHash = outer.hash;

      const innerResults = outer.validated ? await xrplBatch.fetchInnerResults(record.batch) : undefined;
      const settled =
        outer.result === "tesSUCCESS" && !!innerResults && innerResults.every((r) => r.result === "tesSUCCESS");

      if (!settled) {
        record.status = "failed";
        listing.status = "open";
        listing.buyerFanId = undefined;
        listing.batchId = undefined;
        save();
        const failed = innerResults?.find((r) => r.result !== "tesSUCCESS");
        events.emit(
          "ledger.rejected",
          `Resale Batch did not settle: outer ${outer.result}` + (failed ? `, inner #${failed.index} ${failed.result}` : ""),
          { listingId: listing.id, batchId, txHash: outer.hash },
        );
        return {
          status: "failed",
          txHash: outer.hash,
          explorerUrl: xrplExplorer.transactionUrl(outer.hash),
          innerResults,
        };
      }

      record.status = "settled";
      listing.status = "settled";
      listing.txHash = outer.hash;
      listing.explorerUrl = xrplExplorer.transactionUrl(outer.hash);
      state.stats.resales += 1;
      state.stats.feesRlusd = addAmounts(state.stats.feesRlusd, zarToSettle(Number(listing.feeZar)));
      save();

      mandateService.recordPurchase(record.buyerFanId, 1);
      fanService.addHistory(record.sellerFanId, {
        kind: "resale_sold",
        description: `Resold 1 ticket to ${record.buyerFanId} for R${listing.priceZar}`,
        tickets: -1,
        amountRlusd: zarToSettle(Number(listing.priceZar)),
        txHash: outer.hash,
      });
      fanService.addHistory(record.buyerFanId, {
        kind: "resale_bought",
        description: `Bought 1 resale ticket from ${record.sellerFanId} for R${listing.totalZar}`,
        tickets: 1,
        amountRlusd: zarToSettle(Number(listing.totalZar)),
        txHash: outer.hash,
      });
      events.emit(
        "resale.settled",
        `${record.sellerFanId} sold to ${record.buyerFanId} in one Batch: R${listing.priceZar} + R${listing.feeZar} fee to promoter`,
        { listingId: listing.id, batchId, txHash: outer.hash },
      );

      return {
        status: "settled",
        txHash: outer.hash,
        explorerUrl: listing.explorerUrl,
        innerResults,
      };
    } catch (error) {
      record.status = "failed";
      listing.status = "open";
      listing.buyerFanId = undefined;
      listing.batchId = undefined;
      save();
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, "LEDGER_ERROR", `Batch submit failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.finish(batchId);
    }
  }
}
