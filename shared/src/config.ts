// One switch for the whole project. Set XRPL_NETWORK=testnet or devnet in .env.
//
// Testnet settles in RLUSD (or XRP with SETTLE_ASSET=XRP).
// Devnet settles in XRP (RLUSD does not exist on Devnet).

export type NetworkName = "testnet" | "devnet";
export type SettleAsset = "RLUSD" | "XRP";

export interface NetworkConfig {
  name: NetworkName;
  wss: string;
  explorerBase: string;
  faucet: string;
  settleAsset: SettleAsset;
  // Demo FX rate: how many Rand one unit of the settle asset is worth.
  defaultFxZarPerUnit: number;
}

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  testnet: {
    name: "testnet",
    wss: "wss://s.altnet.rippletest.net:51233",
    explorerBase: "https://testnet.xrpl.org",
    faucet: "https://faucet.altnet.rippletest.net/accounts",
    settleAsset: "RLUSD",
    defaultFxZarPerUnit: 18,
  },
  devnet: {
    name: "devnet",
    wss: "wss://s.devnet.rippletest.net:51233",
    explorerBase: "https://devnet.xrpl.org",
    faucet: "https://faucet.devnet.rippletest.net/accounts",
    settleAsset: "XRP",
    // Devnet faucet hands out 100 XRP per call; R100/XRP keeps demo amounts small.
    defaultFxZarPerUnit: 100,
  },
};

// RLUSD on Testnet (from Ripple's docs). Currency code "RLUSD" as 160-bit hex.
export const RLUSD_TESTNET_ISSUER = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";
export const RLUSD_CURRENCY_HEX = "524C555344000000000000000000000000000000";

// Credential type the promoter issues to verified fans' agent wallets.
export const CREDENTIAL_TYPE = "DropVerifiedFan";

// Memo type on every agent payment and promoter refund/ticket send.
export const MEMO_TYPE = "drop";

// The demo event that setup.ts issues tickets for.
export const DROP_DEFAULTS = {
  name: "Sunset Sessions Live",
  venue: "Long Street, Cape Town",
  startsAt: "2026-12-12T19:00:00+02:00",
  priceZar: 1200,
  supply: 3,
  maxPerFan: 4,
  resaleCapZar: 1800,
  resaleFeePct: 5,
};

// How long a primary-sale intent reserves supply before it expires.
export const SALE_INTENT_TTL_MS = 5 * 60 * 1000;
// How long the promoter holds its Sequence while seller and buyer sign a resale Batch.
export const BATCH_SIGNING_TTL_MS = 55 * 1000;

const env: Record<string, string | undefined> =
  typeof process !== "undefined" && process.env ? process.env : {};

function pickNetwork(): NetworkName {
  const raw = (env.XRPL_NETWORK || "").toLowerCase();
  return raw === "devnet" ? "devnet" : "testnet";
}

const base = NETWORKS[pickNetwork()];

// SETTLE_ASSET=XRP pays in test XRP on Testnet too, for when the RLUSD faucet is not paying out.
// Accounts, events and tickets stay the same; only the money changes.
const payInXrp = base.settleAsset === "XRP" || (env.SETTLE_ASSET || "").toUpperCase() === "XRP";

export const ACTIVE = {
  ...base,
  settleAsset: (payInXrp ? "XRP" : "RLUSD") as SettleAsset,
  wss: env.XRPL_WSS || base.wss,
  rlusdIssuer: env.RLUSD_ISSUER || RLUSD_TESTNET_ISSUER,
  fxZarPerUnit: payInXrp
    ? Number(env.FX_ZAR_PER_XRP) || NETWORKS.devnet.defaultFxZarPerUnit
    : Number(env.FX_ZAR_PER_RLUSD) || base.defaultFxZarPerUnit,
};

export function explorerTxUrl(hash: string): string {
  return `${ACTIVE.explorerBase}/transactions/${hash}`;
}

export function explorerAccountUrl(address: string): string {
  return `${ACTIVE.explorerBase}/accounts/${address}`;
}
