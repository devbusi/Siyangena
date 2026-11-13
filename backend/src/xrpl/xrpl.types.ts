export interface SubmitResult {
  hash: string;
  // Final engine result, e.g. "tesSUCCESS", "tecNO_AUTH", "tecPATH_DRY".
  result: string;
  validated: boolean;
  meta?: any;
}

export interface ConnectionStatus {
  connected: boolean;
  network: string;
  ledgerIndex?: number;
  promoterAddress?: string;
}
