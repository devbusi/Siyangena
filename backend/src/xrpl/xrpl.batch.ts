import {
  Batch,
  BatchFlags,
  combineBatchSigners,
  decode,
  encode,
  GlobalFlags,
  hashes,
} from "xrpl";
import { encodeDropMemo, type InnerResult } from "@drop/shared";
import { xrplClient } from "./xrpl.client";
import { xrplWallet } from "./xrpl.wallet";
import { settleAmount, ticketAmount } from "./xrpl.amounts";
import { xrplExplorer } from "./xrpl.explorer";
import { SubmitResult } from "./xrpl.types";

// Atomic resale (docs/PLAN.md section 4). Outer Account = promoter, tfAllOrNothing,
// BatchSigners = seller and buyer. Inner order matters: ticket back to the promoter
// first, so supply is free even when the drop is sold out.
export const INNER_DESCRIPTIONS = [
  "Ticket: seller to promoter",
  "Payment: buyer to seller (price)",
  "Payment: buyer to promoter (fee)",
  "Ticket: promoter to buyer",
];

// Caller must already hold xrplClient.promoterQueue: autofill fixes the promoter's
// Sequence, and nothing else may use it until this Batch is submitted.
async function buildResaleBatch(params: {
  seller: string;
  buyer: string;
  issuanceId: string;
  priceRlusd: string;
  feeRlusd: string;
  listingId: string;
}): Promise<Batch> {
  const promoter = xrplWallet.getPromoterWallet().address;
  const inner = GlobalFlags.tfInnerBatchTxn;

  const batch: Batch = {
    TransactionType: "Batch",
    Account: promoter,
    Flags: BatchFlags.tfAllOrNothing,
    Memos: encodeDropMemo({ kind: "resale", listingId: params.listingId }),
    RawTransactions: [
      {
        RawTransaction: {
          TransactionType: "Payment",
          Account: params.seller,
          Destination: promoter,
          Amount: ticketAmount(params.issuanceId, 1),
          Flags: inner,
        },
      },
      {
        RawTransaction: {
          TransactionType: "Payment",
          Account: params.buyer,
          Destination: params.seller,
          Amount: settleAmount(params.priceRlusd),
          Flags: inner,
        },
      },
      {
        RawTransaction: {
          TransactionType: "Payment",
          Account: params.buyer,
          Destination: promoter,
          Amount: settleAmount(params.feeRlusd),
          Flags: inner,
        },
      },
      {
        RawTransaction: {
          TransactionType: "Payment",
          Account: promoter,
          Destination: params.buyer,
          Amount: ticketAmount(params.issuanceId, 1),
          Flags: inner,
        },
      },
    ],
  };

  const c = await xrplClient.ensureConnected();
  // Two BatchSigners (seller and buyer) for the fee calculation.
  return (await c.autofill(batch, 2)) as Batch;
}

function asBatch(input: Record<string, unknown> | string): Batch {
  return (typeof input === "string" ? decode(input) : input) as unknown as Batch;
}

function withoutSigners(tx: Batch): string {
  const { BatchSigners: _ignored, ...rest } = tx as any;
  return encode(rest);
}

// A signed copy must be byte-identical to what we built, apart from BatchSigners,
// and carry exactly one signature from the expected account.
function checkSignedBatch(
  stored: Record<string, unknown>,
  signed: Record<string, unknown> | string,
  expectedSigner: string,
): { ok: true; batch: Batch } | { ok: false; reason: string } {
  let batch: Batch;
  try {
    batch = asBatch(signed);
  } catch {
    return { ok: false, reason: "signedBatch could not be decoded" };
  }
  const signers = batch.BatchSigners ?? [];
  if (signers.length !== 1 || signers[0].BatchSigner.Account !== expectedSigner) {
    return { ok: false, reason: `expected exactly one BatchSigner for ${expectedSigner}` };
  }
  if (!signers[0].BatchSigner.TxnSignature && !signers[0].BatchSigner.Signers) {
    return { ok: false, reason: "BatchSigner has no signature" };
  }
  try {
    if (withoutSigners(batch) !== withoutSigners(asBatch(stored))) {
      return { ok: false, reason: "signed Batch differs from the Batch the promoter built" };
    }
  } catch {
    return { ok: false, reason: "signedBatch is not a valid Batch transaction" };
  }
  return { ok: true, batch };
}

// Promoter signs last and submits. Caller still holds the promoter queue lock.
async function submitResaleBatch(signedCopies: Batch[]): Promise<SubmitResult> {
  const promoter = xrplWallet.getPromoterWallet();
  const combined = asBatch(combineBatchSigners(signedCopies));
  const signed = promoter.sign(combined);
  return xrplClient.submitSignedBlob(signed.tx_blob, signed.hash, combined.LastLedgerSequence!);
}

// An outer tesSUCCESS does not mean the inner transactions succeeded: look each one up.
async function fetchInnerResults(batch: Record<string, unknown>): Promise<InnerResult[]> {
  const c = await xrplClient.ensureConnected();
  const raws = asBatch(batch).RawTransactions;
  const results: InnerResult[] = [];

  for (let i = 0; i < raws.length; i++) {
    const hash = hashes.hashSignedTx(raws[i].RawTransaction as any);
    let result = "not found";
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res: any = await c.request({ command: "tx", transaction: hash });
        if (res.result.validated) {
          result = res.result.meta?.TransactionResult ?? "unknown";
          break;
        }
      } catch (error: any) {
        if (error?.data?.error !== "txnNotFound") throw error;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    results.push({
      index: i + 1,
      description: INNER_DESCRIPTIONS[i] ?? `Inner ${i + 1}`,
      hash,
      result,
      explorerUrl: xrplExplorer.transactionUrl(hash),
    });
  }
  return results;
}

export const xrplBatch = {
  buildResaleBatch,
  checkSignedBatch,
  submitResaleBatch,
  fetchInnerResults,
};
