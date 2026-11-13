import { convertStringToHex, Wallet } from "xrpl";
import { CREDENTIAL_TYPE } from "@drop/shared";
import { xrplClient } from "./xrpl.client";
import { xrplWallet } from "./xrpl.wallet";
import { SubmitResult } from "./xrpl.types";

const CREDENTIAL_TYPE_HEX = convertStringToHex(CREDENTIAL_TYPE);
const lsfAccepted = 0x00010000;

// Promoter issues a "verified fan" Credential to the fan's agent wallet.
async function createCredential(subject: string): Promise<SubmitResult> {
  const promoter = xrplWallet.getPromoterWallet();
  return xrplClient.submitAsPromoter({
    TransactionType: "CredentialCreate",
    Account: promoter.address,
    Subject: subject,
    CredentialType: CREDENTIAL_TYPE_HEX,
  });
}

// The subject (agent wallet) accepts it, so it counts on the ledger.
async function acceptCredential(subject: Wallet): Promise<SubmitResult> {
  const promoter = xrplWallet.getPromoterWallet();
  return xrplClient.submitTx(subject, {
    TransactionType: "CredentialAccept",
    Account: subject.address,
    Issuer: promoter.address,
    CredentialType: CREDENTIAL_TYPE_HEX,
  });
}

async function getCredential(subject: string): Promise<{ exists: boolean; accepted: boolean }> {
  const promoter = xrplWallet.getPromoterWallet();
  const c = await xrplClient.ensureConnected();
  try {
    const res: any = await c.request({
      command: "ledger_entry",
      credential: { subject, issuer: promoter.address, credential_type: CREDENTIAL_TYPE_HEX },
      ledger_index: "validated",
    } as any);
    return { exists: true, accepted: Boolean((res.result.node.Flags ?? 0) & lsfAccepted) };
  } catch (error: any) {
    if (error?.data?.error === "entryNotFound") return { exists: false, accepted: false };
    throw error;
  }
}

export const xrplCredentials = {
  createCredential,
  acceptCredential,
  getCredential,
};
