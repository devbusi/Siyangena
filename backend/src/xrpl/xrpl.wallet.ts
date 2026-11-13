import { Wallet } from "xrpl";
import { xrplConfig } from "./xrpl.config";

// Demo wallets come from seeds in .env (written by scripts/setup.ts).
// Testnet/Devnet only: never put a Mainnet seed here.

const cache = new Map<string, Wallet>();

function fromEnv(envName: string): Wallet | null {
  const seed = process.env[envName];
  if (!seed) return null;
  let wallet = cache.get(envName);
  if (!wallet) {
    wallet = Wallet.fromSeed(seed);
    cache.set(envName, wallet);
  }
  return wallet;
}

function getPromoterWallet(): Wallet {
  return fromEnv("PROMOTER_SEED") ?? Wallet.fromSeed(xrplConfig.promoterSeed);
}

export const xrplWallet = {
  fromEnv,
  getPromoterWallet,
};
