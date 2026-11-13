import { ACTIVE } from "@drop/shared";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const xrplConfig = {
  network: ACTIVE.name,
  server: ACTIVE.wss,
  settleAsset: ACTIVE.settleAsset,
  rlusdIssuer: ACTIVE.rlusdIssuer,
  fxZarPerUnit: ACTIVE.fxZarPerUnit,
  get promoterSeed() {
    return required("PROMOTER_SEED");
  },
  hasPromoter() {
    return Boolean(process.env.PROMOTER_SEED);
  },
};
