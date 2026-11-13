import { convertStringToHex, MPTokenIssuanceCreateFlags, Wallet } from "xrpl";
import { encodeDropMemo, type DropMemo } from "@drop/shared";
import { xrplClient } from "./xrpl.client";
import { xrplWallet } from "./xrpl.wallet";
import { ticketAmount } from "./xrpl.amounts";
import { SubmitResult } from "./xrpl.types";

// Tickets are MPTs with RequireAuth and *without* CanTransfer:
// only authorised holders can hold them, and holders can only send them back to
// the promoter (issuer), never to each other. That is what kills off-platform resale.

async function createIssuance(params: { supply: number; name: string; venue: string; startsAt: string }) {
  const promoter = xrplWallet.getPromoterWallet();
  const metadata = {
    ticker: "SIYA",
    name: params.name,
    desc: `${params.venue}, ${params.startsAt}`,
    asset_class: "other",
    issuer_name: "Siyangena",
  };

  const result = await xrplClient.submitAsPromoter({
    TransactionType: "MPTokenIssuanceCreate",
    Account: promoter.address,
    AssetScale: 0,
    MaximumAmount: String(params.supply),
    Flags: MPTokenIssuanceCreateFlags.tfMPTRequireAuth,
    MPTokenMetadata: convertStringToHex(JSON.stringify(metadata)),
  });

  if (result.result !== "tesSUCCESS") {
    throw new Error(`MPTokenIssuanceCreate failed: ${result.result}`);
  }

  const issuanceId: string | undefined = result.meta?.mpt_issuance_id;
  if (!issuanceId) {
    throw new Error("MPTokenIssuanceCreate succeeded but meta had no mpt_issuance_id");
  }
  return { issuanceId, txHash: result.hash };
}

// Holder side: the fan's agent wallet opts in to the official issuance ID.
// Fake tickets fail because fans never opt in to anything else.
async function holderOptIn(holder: Wallet, issuanceId: string): Promise<SubmitResult> {
  return xrplClient.submitTx(holder, {
    TransactionType: "MPTokenAuthorize",
    Account: holder.address,
    MPTokenIssuanceID: issuanceId,
  });
}

// Issuer side: promoter authorises a holder (RequireAuth).
async function authorizeHolder(holderAddress: string, issuanceId: string): Promise<SubmitResult> {
  const promoter = xrplWallet.getPromoterWallet();
  return xrplClient.submitAsPromoter({
    TransactionType: "MPTokenAuthorize",
    Account: promoter.address,
    MPTokenIssuanceID: issuanceId,
    Holder: holderAddress,
  });
}

async function sendTickets(params: {
  to: string;
  issuanceId: string;
  quantity: number;
  memo: DropMemo;
}): Promise<SubmitResult> {
  const promoter = xrplWallet.getPromoterWallet();
  return xrplClient.submitAsPromoter({
    TransactionType: "Payment",
    Account: promoter.address,
    Destination: params.to,
    Amount: ticketAmount(params.issuanceId, params.quantity),
    Memos: encodeDropMemo(params.memo),
  });
}

const lsfMPTAuthorized = 0x00000002;

// MPToken ledger entry for a holder, or null if they never opted in.
async function getHolding(address: string, issuanceId: string) {
  const c = await xrplClient.ensureConnected();
  try {
    const res: any = await c.request({
      command: "ledger_entry",
      mptoken: { mpt_issuance_id: issuanceId, account: address },
      ledger_index: "validated",
    } as any);
    const node = res.result.node;
    return {
      optedIn: true,
      authorized: Boolean((node.Flags ?? 0) & lsfMPTAuthorized),
      balance: Number(node.MPTAmount ?? 0),
    };
  } catch (error: any) {
    if (error?.data?.error === "entryNotFound") {
      return { optedIn: false, authorized: false, balance: 0 };
    }
    throw error;
  }
}

async function getTicketBalance(address: string, issuanceId: string): Promise<number> {
  return (await getHolding(address, issuanceId)).balance;
}

async function getIssuance(issuanceId: string) {
  const c = await xrplClient.ensureConnected();
  const res: any = await c.request({
    command: "ledger_entry",
    mpt_issuance: issuanceId,
    ledger_index: "validated",
  } as any);
  const node = res.result.node;
  return {
    maximum: Number(node.MaximumAmount ?? 0),
    outstanding: Number(node.OutstandingAmount ?? 0),
    issuer: node.Issuer as string,
  };
}

export const xrplMpt = {
  createIssuance,
  holderOptIn,
  authorizeHolder,
  sendTickets,
  getHolding,
  getTicketBalance,
  getIssuance,
};
