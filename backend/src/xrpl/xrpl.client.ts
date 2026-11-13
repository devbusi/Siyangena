import { Client, SubmittableTransaction, Wallet } from "xrpl";
import { xrplConfig } from "./xrpl.config";
import { xrplWallet } from "./xrpl.wallet";
import { Mutex } from "../lib/utils/mutex";
import { SubmitResult } from "./xrpl.types";

let client: Client | null = null;
let connecting: Promise<void> | null = null;

function getClient(): Client {
  if (!client) {
    client = new Client(xrplConfig.server);
  }
  return client;
}

async function ensureConnected(): Promise<Client> {
  const c = getClient();
  if (!c.isConnected()) {
    connecting ??= c.connect().finally(() => (connecting = null));
    await connecting;
  }
  return c;
}

async function disconnect(): Promise<void> {
  if (client && client.isConnected()) {
    await client.disconnect();
  }
}

async function getLedgerIndex(): Promise<number> {
  const c = await ensureConnected();
  return c.getLedgerIndex();
}

async function getXrpBalance(address: string): Promise<number> {
  const c = await ensureConnected();
  try {
    return await c.getXrpBalance(address);
  } catch (error) {
    // Unfunded accounts throw here: treat as zero balance.
    return 0;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Poll until the tx is validated or its LastLedgerSequence has passed.
async function waitForValidation(hash: string, lastLedger: number): Promise<SubmitResult> {
  const c = await ensureConnected();
  for (;;) {
    await sleep(1000);
    try {
      const res: any = await c.request({ command: "tx", transaction: hash });
      if (res.result.validated) {
        return { hash, result: res.result.meta?.TransactionResult ?? "unknown", validated: true, meta: res.result.meta };
      }
    } catch (error: any) {
      if (error?.data?.error !== "txnNotFound") throw error;
    }
    const current = await c.getLedgerIndex();
    if (current > lastLedger) {
      return { hash, result: "expired (LastLedgerSequence passed)", validated: false };
    }
  }
}

// Submit an already-signed blob. tem/tef/tel results return straight away instead of
// waiting ~80s for LastLedgerSequence like client.submitAndWait does.
async function submitSignedBlob(txBlob: string, hash: string, lastLedger: number): Promise<SubmitResult> {
  const c = await ensureConnected();
  const res: any = await c.request({ command: "submit", tx_blob: txBlob });
  const prelim: string = res.result.engine_result;
  if (/^(tem|tef|tel)/.test(prelim)) {
    return { hash, result: prelim, validated: false };
  }
  return waitForValidation(hash, lastLedger);
}

// Autofill, sign and submit as `wallet`. Never throws on a ledger rejection:
// callers read `result` (rejections are part of the demo).
async function submitTx(
  wallet: Wallet,
  tx: SubmittableTransaction,
): Promise<SubmitResult> {
  const c = await ensureConnected();
  const prepared = await c.autofill(tx);
  const signed = wallet.sign(prepared);
  return submitSignedBlob(signed.tx_blob, signed.hash, prepared.LastLedgerSequence!);
}

// One queue for every promoter transaction. A resale Batch holds this lock from
// autofill (which fixes the promoter Sequence) until it is submitted or expires.
const promoterQueue = new Mutex();

function submitAsPromoter(tx: SubmittableTransaction): Promise<SubmitResult> {
  return promoterQueue.run(() => submitTx(xrplWallet.getPromoterWallet(), tx));
}

export const xrplClient = {
  getClient,
  ensureConnected,
  disconnect,
  getLedgerIndex,
  getXrpBalance,
  submitTx,
  submitSignedBlob,
  waitForValidation,
  submitAsPromoter,
  promoterQueue,
};
