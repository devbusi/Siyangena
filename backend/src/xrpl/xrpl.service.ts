import { xrplConfig } from "./xrpl.config";
import { xrplClient } from "./xrpl.client";
import { xrplWallet } from "./xrpl.wallet";
import { ConnectionStatus } from "./xrpl.types";

async function verifyConnection(): Promise<ConnectionStatus> {
  const promoterAddress = xrplConfig.hasPromoter() ? xrplWallet.getPromoterWallet().address : undefined;
  try {
    const ledgerIndex = await xrplClient.getLedgerIndex();
    return { connected: true, network: xrplConfig.network, ledgerIndex, promoterAddress };
  } catch (error) {
    console.error("Error verifying XRPL connection:", error);
    return { connected: false, network: xrplConfig.network, promoterAddress };
  }
}

export const xrplService = {
  verifyConnection,
};
