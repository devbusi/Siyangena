import { z } from "zod";
import { xrpToDrops } from "xrpl";
import {
  ACTIVE,
  RLUSD_CURRENCY_HEX,
  encodeDropMemo,
  explorerTxUrl,
  type AcceptListingResponse,
  type Drop,
  type Fan,
  type FanTickets,
  type FanWallet,
  type Listing,
  type Mandate,
  type ResaleBatchView,
  type SaleIntent,
  type SubmitSignatureResponse,
} from "@drop/shared";
import { api } from "./api";
import { agentWallet, ledger } from "./wallet";
import { signResaleBatch } from "./signer";

// The agent's actions. The MCP server exposes these as tools, and the policy runner calls
// them directly. Every limit is checked outside the agent: by the promoter service
// (mandate, per-fan max, resale cap) and by the ledger (balance, opt-in, no fan-to-fan).

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function settleAmount(value: string): any {
  return ACTIVE.settleAsset === "XRP"
    ? xrpToDrops(value)
    : { currency: RLUSD_CURRENCY_HEX, issuer: ACTIVE.rlusdIssuer, value };
}

async function log(fanId: string, tool: string, reason: string, txHash?: string) {
  const mandate = await api.get<Mandate>(`/fans/${fanId}/mandate`);
  await api.post("/agent-log", {
    fanId,
    mandateId: mandate.ok ? mandate.data.id : "none",
    tool,
    reason,
    ...(txHash ? { txHash } : {}),
  });
}

export async function getDropStatus() {
  const drop = await api.get<Drop>("/drop");
  if (!drop.ok) return drop;
  const d = drop.data;
  return {
    ok: true,
    event: d.name,
    venue: d.venue,
    state: d.state,
    priceZar: d.priceZar,
    ticketsLeft: d.supply - d.sold,
    maxPerFan: d.maxPerFan,
    resaleCapZar: d.resaleCapZar,
    resaleFeePct: d.resaleFeePct,
  };
}

export async function waitForSalesOpen(timeoutSeconds = 120) {
  const until = Date.now() + timeoutSeconds * 1000;
  for (;;) {
    const status = await getDropStatus();
    if (!status.ok) return status;
    if ((status as any).state !== "scheduled") return status;
    if (Date.now() > until) return { ok: false, code: "TIMEOUT", message: "Sales did not open in time", status };
    await sleep(1500);
  }
}

export async function getMandate(fanId: string) {
  return api.get<Mandate>(`/fans/${fanId}/mandate`);
}

export async function getWalletBalance(fanId: string) {
  const wallet = await api.get<FanWallet>(`/fans/${fanId}/wallet`);
  if (!wallet.ok) return wallet;
  return { ok: true, allowanceZar: wallet.data.allowanceZar, tickets: wallet.data.tickets, settleAsset: ACTIVE.settleAsset };
}

// Primary purchase: ask the service for a purchase slot (it checks the mandate, the per-fan
// max and supply), then pay from the agent wallet with the returned memo.
export async function buyTicket(fanId: string, quantity: number, reason: string) {
  const intent = await api.post<SaleIntent>("/sales/intents", { fanId, quantity });
  if (!intent.ok) {
    await log(fanId, "buy_ticket", `Blocked by the promoter service: ${intent.code}. ${reason}`);
    return { ok: false, blockedBy: "promoter service", code: intent.code, message: intent.message };
  }

  const wallet = agentWallet(fanId);
  const client = await ledger();
  const before = await api.get<FanTickets>(`/fans/${fanId}/tickets`);
  let res: any;
  try {
    res = await client.submitAndWait(
      {
        TransactionType: "Payment",
        Account: wallet.address,
        Destination: intent.data.payTo,
        Amount: settleAmount(intent.data.amountRlusd),
        Memos: encodeDropMemo(intent.data.memo),
      },
      { autofill: true, wallet },
    );
  } catch (error) {
    return { ok: false, blockedBy: "ledger", message: error instanceof Error ? error.message : String(error) };
  }
  const code = res.result.meta?.TransactionResult;
  const hash = res.result.hash;
  await log(fanId, "buy_ticket", reason, hash);
  if (code !== "tesSUCCESS") {
    return { ok: false, blockedBy: "ledger", code, paymentTx: explorerTxUrl(hash) };
  }

  // Wait for the promoter's sale watcher to send the tickets.
  const start = before.ok ? before.data.count : 0;
  for (let i = 0; i < 20; i++) {
    await sleep(1500);
    const now = await api.get<FanTickets>(`/fans/${fanId}/tickets`);
    if (now.ok && now.data.count >= start + quantity) {
      return { ok: true, paid: `R${Number(intent.data.amountRlusd) * ACTIVE.fxZarPerUnit}`, paymentTx: explorerTxUrl(hash), ticketsHeld: now.data.count };
    }
  }
  return { ok: true, paymentTx: explorerTxUrl(hash), note: "Paid. Tickets not visible yet, check again shortly." };
}

export async function browseResale() {
  const listings = await api.get<Listing[]>("/resale/listings");
  if (!listings.ok) return listings;
  return {
    ok: true,
    open: listings.data
      .filter((l) => l.status === "open")
      .map((l) => ({ listingId: l.id, seller: l.sellerFanId, priceZar: l.priceZar, feeZar: l.feeZar, totalZar: l.totalZar })),
  };
}

async function expectedFor(listing: Listing, buyerFanId: string) {
  const [seller, buyer, drop] = await Promise.all([
    api.get<Fan>(`/fans/${listing.sellerFanId}`),
    api.get<Fan>(`/fans/${buyerFanId}`),
    api.get<Drop>("/drop"),
  ]);
  if (!seller.ok || !buyer.ok || !drop.ok) throw new Error("could not load the resale parties");
  return {
    seller: seller.data.agentAddress,
    buyer: buyer.data.agentAddress,
    issuanceId: drop.data.issuanceId,
    priceZar: Number(listing.priceZar),
    feeZar: Number(listing.feeZar),
  };
}

async function waitForBatch(batchId: string) {
  for (let i = 0; i < 40; i++) {
    const b = await api.get<ResaleBatchView>(`/resale/batches/${batchId}`);
    if (b.ok && b.data.status !== "awaiting_signatures" && b.data.status !== "submitted") return b.data;
    await sleep(1500);
  }
  return null;
}

// Buyer side of a resale. The service checks the promoter's cap and this fan's mandate,
// the signer checks the Batch matches the listing, then the promoter co-signs last.
export async function acceptResale(fanId: string, listingId: string, reason: string) {
  const listings = await api.get<Listing[]>("/resale/listings");
  const listing = listings.ok ? listings.data.find((l) => l.id === listingId) : undefined;
  if (!listing) return { ok: false, code: "NOT_FOUND", message: `Listing ${listingId} not found` };

  const accepted = await api.post<AcceptListingResponse>(`/resale/listings/${listingId}/accept`, { buyerFanId: fanId });
  if (!accepted.ok) {
    await log(fanId, "accept_resale", `Blocked by the promoter service: ${accepted.code}. ${reason}`);
    return { ok: false, blockedBy: "promoter service", code: accepted.code, message: accepted.message };
  }

  let signed;
  try {
    signed = signResaleBatch(agentWallet(fanId), accepted.data.batch, await expectedFor(listing, fanId));
  } catch (error) {
    return { ok: false, blockedBy: "agent signer", message: error instanceof Error ? error.message : String(error) };
  }
  const submitted = await api.post<SubmitSignatureResponse>(`/resale/batches/${accepted.data.batchId}/signatures`, {
    fanId,
    signedBatch: signed,
  });
  if (!submitted.ok) return { ok: false, code: submitted.code, message: submitted.message };
  await log(fanId, "accept_resale", reason);

  const final = submitted.data.status === "awaiting_signatures" ? await waitForBatch(accepted.data.batchId) : null;
  const status = final?.status ?? submitted.data.status;
  return { ok: status === "settled", status, batchId: accepted.data.batchId, ...(submitted.data.explorerUrl ? { tx: submitted.data.explorerUrl } : {}) };
}

export async function listForResale(fanId: string, priceZar: number, reason: string) {
  const listing = await api.post<Listing>("/resale/listings", { fanId, priceZar });
  await log(fanId, "list_for_resale", reason);
  if (!listing.ok) return { ok: false, code: listing.code, message: listing.message };
  return { ok: true, listingId: listing.data.id, priceZar: listing.data.priceZar, buyerPaysZar: listing.data.totalZar };
}

// Seller side: sign any Batch a buyer has started on this fan's listings.
export async function signMyResales(fanId: string) {
  const listings = await api.get<Listing[]>("/resale/listings");
  if (!listings.ok) return listings;
  const results: any[] = [];
  for (const listing of listings.data) {
    if (listing.sellerFanId !== fanId || listing.status !== "signing" || !listing.batchId || !listing.buyerFanId) continue;
    const batch = await api.get<ResaleBatchView>(`/resale/batches/${listing.batchId}`);
    if (!batch.ok || batch.data.status !== "awaiting_signatures" || batch.data.signedBy.includes(fanId)) continue;
    try {
      const signed = signResaleBatch(agentWallet(fanId), batch.data.batch, await expectedFor(listing, listing.buyerFanId));
      const res = await api.post<SubmitSignatureResponse>(`/resale/batches/${listing.batchId}/signatures`, { fanId, signedBatch: signed });
      await log(fanId, "sign_my_resales", `Signed resale of 1 ticket to ${listing.buyerFanId} for R${listing.priceZar}`);
      results.push({ listingId: listing.id, status: res.ok ? res.data.status : res.code });
    } catch (error) {
      results.push({ listingId: listing.id, refused: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ok: true, signed: results };
}

// ---- Tool catalogue (shared by the MCP server and the runner) ----

export interface AgentTool {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  run: (args: any) => Promise<unknown>;
}

export function toolCatalogue(fanId: string): AgentTool[] {
  return [
    {
      name: "get_drop_status",
      description: "Get the event, whether sales are open, the price in rand, tickets left, the per-fan max and the resale cap.",
      shape: {},
      run: () => getDropStatus(),
    },
    {
      name: "wait_for_sales_open",
      description: "Wait until ticket sales open (or the timeout passes), then return the event status.",
      shape: { timeoutSeconds: z.number().int().min(5).max(600).optional() },
      run: (a: any) => waitForSalesOpen(a.timeoutSeconds ?? 120),
    },
    {
      name: "get_mandate",
      description: "Read your mandate: how many tickets your human wants and the most they will pay per ticket (all-in). You cannot change it.",
      shape: {},
      run: () => getMandate(fanId),
    },
    {
      name: "get_wallet_balance",
      description: "Your allowance left (in rand) and how many tickets you hold.",
      shape: {},
      run: () => getWalletBalance(fanId),
    },
    {
      name: "buy_ticket",
      description: "Buy tickets at face value from the promoter. The promoter service and the ledger enforce your limits.",
      shape: { quantity: z.number().int().min(1).max(4), reason: z.string().describe("One sentence: why you are buying") },
      run: (a: any) => buyTicket(fanId, a.quantity, a.reason),
    },
    {
      name: "browse_resale",
      description: "List open resale listings, with the price, the promoter's fee and the total a buyer pays (in rand).",
      shape: {},
      run: () => browseResale(),
    },
    {
      name: "accept_resale",
      description: "Buy one resale ticket. Settles as one atomic swap: the ticket and the payment move together or not at all.",
      shape: { listingId: z.string(), reason: z.string().describe("One sentence: why this listing fits the mandate") },
      run: (a: any) => acceptResale(fanId, a.listingId, a.reason),
    },
    {
      name: "list_for_resale",
      description: "List one of your tickets for resale through Siyangena at a price in rand (the promoter caps it).",
      shape: { priceZar: z.number().positive(), reason: z.string() },
      run: (a: any) => listForResale(fanId, a.priceZar, a.reason),
    },
    {
      name: "sign_my_resales",
      description: "Sign the swap for any of your listings a buyer has accepted. Only signs if the deal matches the listing.",
      shape: {},
      run: () => signMyResales(fanId),
    },
  ];
}
