import { RLUSD_CURRENCY_HEX, encodeDropMemo, type DropMemo } from "@drop/shared";
import { xrplClient } from "./xrpl.client";
import { xrplConfig } from "./xrpl.config";
import { xrplWallet } from "./xrpl.wallet";
import { settleAmount } from "./xrpl.amounts";
import { SubmitResult } from "./xrpl.types";

// Promoter pays out in the settle asset (refunds).
async function promoterPay(params: { to: string; amount: string; memo: DropMemo }): Promise<SubmitResult> {
  const promoter = xrplWallet.getPromoterWallet();
  return xrplClient.submitAsPromoter({
    TransactionType: "Payment",
    Account: promoter.address,
    Destination: params.to,
    Amount: settleAmount(params.amount),
    Memos: encodeDropMemo(params.memo),
  });
}

// Balance of the settle asset (RLUSD trust line, or XRP on Devnet).
async function getSettleBalance(address: string): Promise<string> {
  if (xrplConfig.settleAsset === "XRP") {
    return String(await xrplClient.getXrpBalance(address));
  }
  const c = await xrplClient.ensureConnected();
  try {
    const res: any = await c.request({
      command: "account_lines",
      account: address,
      peer: xrplConfig.rlusdIssuer,
      ledger_index: "validated",
    });
    const line = res.result.lines.find((l: any) => l.currency === RLUSD_CURRENCY_HEX || l.currency === "RLUSD");
    return line ? String(line.balance) : "0";
  } catch {
    return "0";
  }
}

export const xrplPayments = {
  promoterPay,
  getSettleBalance,
};
