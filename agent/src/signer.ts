import { Batch, signMultiBatch, Wallet, xrpToDrops } from "xrpl";
import { ACTIVE, RLUSD_CURRENCY_HEX } from "@drop/shared";

// Deterministic check before an agent signs a resale Batch. This is code, not the model:
// the agent only signs if every inner transaction is exactly the deal in the listing.

const tfAllOrNothing = 0x00010000;
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

export interface ExpectedResale {
  seller: string;
  buyer: string;
  issuanceId: string;
  priceZar: number;
  feeZar: number;
}

function settleValue(amount: any): number | null {
  if (ACTIVE.settleAsset === "XRP") {
    return typeof amount === "string" ? Number(amount) / 1e6 : null;
  }
  if (typeof amount === "object" && amount?.currency === RLUSD_CURRENCY_HEX && amount?.issuer === ACTIVE.rlusdIssuer) {
    return Number(amount.value);
  }
  return null;
}

function isOneTicket(amount: any, issuanceId: string): boolean {
  return typeof amount === "object" && amount?.mpt_issuance_id === issuanceId && Number(amount.value) === 1;
}

// Returns null if the Batch matches the listing, otherwise the reason it does not.
export function checkResaleBatch(batch: any, expect: ExpectedResale): string | null {
  if (batch?.TransactionType !== "Batch") return "not a Batch transaction";
  if (((batch.Flags ?? 0) & tfAllOrNothing) === 0) return "Batch is not all-or-nothing";
  const raws = (batch.RawTransactions ?? []).map((r: any) => r.RawTransaction);
  if (raws.length !== 4) return `expected 4 inner transactions, got ${raws.length}`;

  const promoter = batch.Account;
  const price = expect.priceZar / ACTIVE.fxZarPerUnit;
  const fee = expect.feeZar / ACTIVE.fxZarPerUnit;
  const [t1, t2, t3, t4] = raws;

  if (t1.TransactionType !== "Payment" || t1.Account !== expect.seller || t1.Destination !== promoter || !isOneTicket(t1.Amount, expect.issuanceId)) {
    return "inner #1 is not one ticket from the seller to the promoter";
  }
  const p = settleValue(t2.Amount);
  if (t2.TransactionType !== "Payment" || t2.Account !== expect.buyer || t2.Destination !== expect.seller || p === null || !close(p, price)) {
    return `inner #2 is not the R${expect.priceZar} price from buyer to seller`;
  }
  const f = settleValue(t3.Amount);
  if (t3.TransactionType !== "Payment" || t3.Account !== expect.buyer || t3.Destination !== promoter || f === null || !close(f, fee)) {
    return `inner #3 is not the R${expect.feeZar} fee from buyer to promoter`;
  }
  if (t4.TransactionType !== "Payment" || t4.Account !== promoter || t4.Destination !== expect.buyer || !isOneTicket(t4.Amount, expect.issuanceId)) {
    return "inner #4 is not one ticket from the promoter to the buyer";
  }
  return null;
}

// Check, then add this wallet's BatchSigner. Throws if the Batch does not match.
export function signResaleBatch(wallet: Wallet, batch: Record<string, unknown>, expect: ExpectedResale): Batch {
  if (wallet.address !== expect.seller && wallet.address !== expect.buyer) {
    throw new Error("this agent is not a party to the resale");
  }
  const problem = checkResaleBatch(batch, expect);
  if (problem) throw new Error(`Refusing to sign: ${problem}`);
  const copy = structuredClone(batch) as unknown as Batch;
  delete (copy as any).BatchSigners;
  signMultiBatch(wallet, copy);
  return copy;
}

// Exposed for tests and the demo script.
export function settleAmountFor(valueZar: number): any {
  const v = Math.round((valueZar / ACTIVE.fxZarPerUnit) * 1e6) / 1e6;
  return ACTIVE.settleAsset === "XRP"
    ? xrpToDrops(String(v))
    : { currency: RLUSD_CURRENCY_HEX, issuer: ACTIVE.rlusdIssuer, value: String(v) };
}
