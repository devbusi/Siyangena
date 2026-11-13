import { RLUSD_CURRENCY_HEX } from "@drop/shared";
import { dropsToXrp, xrpToDrops } from "xrpl";
import { xrplConfig } from "./xrpl.config";

// Ledger Amount for the settle asset: XRP drops on Devnet, RLUSD IOU on Testnet.
export function settleAmount(value: string): any {
  if (xrplConfig.settleAsset === "XRP") {
    return xrpToDrops(value);
  }
  return { currency: RLUSD_CURRENCY_HEX, issuer: xrplConfig.rlusdIssuer, value };
}

export function ticketAmount(issuanceId: string, quantity: number): any {
  return { mpt_issuance_id: issuanceId, value: String(quantity) };
}

// Reads a delivered/ledger Amount and returns its value if it is the settle asset.
export function readSettleAmount(amount: any): string | null {
  if (amount == null) return null;
  if (typeof amount === "string") {
    return xrplConfig.settleAsset === "XRP" ? String(dropsToXrp(amount)) : null;
  }
  if (
    xrplConfig.settleAsset === "RLUSD" &&
    amount.currency === RLUSD_CURRENCY_HEX &&
    amount.issuer === xrplConfig.rlusdIssuer
  ) {
    return String(amount.value);
  }
  return null;
}

export function isTicketAmount(amount: any, issuanceId: string): boolean {
  return typeof amount === "object" && amount?.mpt_issuance_id === issuanceId;
}
