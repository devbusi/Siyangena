// Demo cast setup. Run: npm run setup
//
// Idempotent: wallets already in .env are reused, steps already on the ledger are skipped.
// 1. Funds every demo wallet from the faucet (Testnet or Devnet, from XRPL_NETWORK).
// 2. Testnet: RLUSD trust lines, then tops up each agent's allowance from BANK.
//    Devnet: trims each agent's XRP so its balance is the allowance (the ledger cap).
// 3. Creates the ticket issuance (MPT, RequireAuth, no CanTransfer) if ISSUANCE_ID is empty.
// 4. Writes seeds, addresses and ISSUANCE_ID back to .env.
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { Client, convertStringToHex, MPTokenIssuanceCreateFlags, Wallet, xrpToDrops } from "xrpl";

const ENV_PATH = path.resolve(__dirname, "../.env");
const EXAMPLE_PATH = path.resolve(__dirname, "../.env.example");
if (!fs.existsSync(ENV_PATH)) fs.copyFileSync(EXAMPLE_PATH, ENV_PATH);
dotenv.config({ path: ENV_PATH, quiet: true });

// Import after .env is loaded: shared/config reads process.env at import time.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const shared = require("@drop/shared") as typeof import("@drop/shared");
const { ACTIVE, DROP_DEFAULTS, RLUSD_CURRENCY_HEX, explorerTxUrl } = shared;

// Allowance per demo agent wallet, in Rand.
const ALLOWANCE_ZAR: Record<string, number> = {
  THANDI_AGENT_SEED: 3000,
  SIPHO_AGENT_SEED: 1500,
  SCALPER_AGENT_SEED: 1200,
};

const WALLETS = [
  "PROMOTER_SEED",
  "BANK_SEED",
  "THANDI_SEED",
  "THANDI_AGENT_SEED",
  "SIPHO_SEED",
  "SIPHO_AGENT_SEED",
  "SCALPER_AGENT_SEED",
  "SCAMMER_SEED",
];

// ---- .env helpers ----

function setEnv(key: string, value: string) {
  let text = fs.readFileSync(ENV_PATH, "utf8");
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  fs.writeFileSync(ENV_PATH, text);
  process.env[key] = value;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const zarToSettle = (zar: number) => round6(zar / ACTIVE.fxZarPerUnit);

async function submit(client: Client, wallet: Wallet, tx: any, label: string) {
  const res: any = await client.submitAndWait(tx, { autofill: true, wallet });
  const code = res.result.meta?.TransactionResult;
  const ok = code === "tesSUCCESS" || code === "tecDUPLICATE";
  console.log(`  ${ok ? "ok     " : "FAILED "} ${label}: ${code}  ${explorerTxUrl(res.result.hash)}`);
  if (!ok) throw new Error(`${label} failed: ${code}`);
  return res;
}

async function rlusdBalance(client: Client, address: string): Promise<number> {
  const res: any = await client.request({
    command: "account_lines",
    account: address,
    peer: ACTIVE.rlusdIssuer,
    ledger_index: "validated",
  });
  const line = res.result.lines.find((l: any) => l.currency === RLUSD_CURRENCY_HEX || l.currency === "RLUSD");
  return line ? Number(line.balance) : 0;
}

async function hasTrustLine(client: Client, address: string): Promise<boolean> {
  const res: any = await client.request({
    command: "account_lines",
    account: address,
    peer: ACTIVE.rlusdIssuer,
    ledger_index: "validated",
  });
  return res.result.lines.some((l: any) => l.currency === RLUSD_CURRENCY_HEX || l.currency === "RLUSD");
}

async function main() {
  console.log(`Network: ${ACTIVE.name} (${ACTIVE.wss}), settles in ${ACTIVE.settleAsset}, R${ACTIVE.fxZarPerUnit} per unit`);
  setEnv("XRPL_NETWORK", ACTIVE.name);
  if (!process.env.FX_ZAR_PER_RLUSD) setEnv("FX_ZAR_PER_RLUSD", String(ACTIVE.fxZarPerUnit));

  const client = new Client(ACTIVE.wss);
  await client.connect();

  // 1. Wallets
  console.log("\n1. Wallets");
  const wallets: Record<string, Wallet> = {};
  for (const key of WALLETS) {
    const existing = process.env[key];
    if (existing) {
      wallets[key] = Wallet.fromSeed(existing);
      console.log(`  reuse  ${key.padEnd(20)} ${wallets[key].address}`);
      continue;
    }
    const { wallet } = await client.fundWallet();
    wallets[key] = wallet;
    setEnv(key, wallet.seed!);
    console.log(`  funded ${key.padEnd(20)} ${wallet.address}`);
  }

  // 2. Allowances
  console.log("\n2. Agent allowances (the ledger cap on what each agent can spend)");
  if (ACTIVE.settleAsset === "RLUSD") {
    for (const key of WALLETS) {
      if (key === "SCAMMER_SEED") continue;
      if (await hasTrustLine(client, wallets[key].address)) continue;
      await submit(
        client,
        wallets[key],
        {
          TransactionType: "TrustSet",
          Account: wallets[key].address,
          LimitAmount: { currency: RLUSD_CURRENCY_HEX, issuer: ACTIVE.rlusdIssuer, value: "1000000" },
        },
        `RLUSD trust line for ${key}`,
      );
    }

    const bank = wallets.BANK_SEED;
    let bankBalance = await rlusdBalance(client, bank.address);
    const needed = Object.entries(ALLOWANCE_ZAR).reduce(async (accP, [key, zar]) => {
      const acc = await accP;
      const have = await rlusdBalance(client, wallets[key].address);
      return acc + Math.max(0, zarToSettle(zar) - have);
    }, Promise.resolve(0));
    const total = round6(await needed);

    if (bankBalance + 1e-9 < total) {
      console.log(`\n  BANK holds ${bankBalance} RLUSD but the agents need ${total} more.`);
      console.log(`  Claim test RLUSD at https://tryrlusd.com for the BANK wallet: ${bank.address}`);
      console.log(`  Or raise FX_ZAR_PER_RLUSD in .env so the demo needs less RLUSD. Then run setup again.`);
    } else {
      for (const [key, zar] of Object.entries(ALLOWANCE_ZAR)) {
        const target = zarToSettle(zar);
        const have = await rlusdBalance(client, wallets[key].address);
        const topUp = round6(target - have);
        if (topUp <= 0) {
          console.log(`  ok      ${key} already holds ${have} RLUSD (R${zar})`);
          continue;
        }
        await submit(
          client,
          bank,
          {
            TransactionType: "Payment",
            Account: bank.address,
            Destination: wallets[key].address,
            Amount: { currency: RLUSD_CURRENCY_HEX, issuer: ACTIVE.rlusdIssuer, value: String(topUp) },
          },
          `${topUp} RLUSD allowance to ${key} (R${zar})`,
        );
        bankBalance -= topUp;
      }
    }
  } else {
    // Devnet + XRP: an agent's XRP balance is its allowance, plus 2 XRP for reserves and fees.
    // Sweep the rest to the fan's main wallet (or the bank) so the ledger caps the agent.
    const sweepTo: Record<string, string> = {
      THANDI_AGENT_SEED: "THANDI_SEED",
      SIPHO_AGENT_SEED: "SIPHO_SEED",
      SCALPER_AGENT_SEED: "BANK_SEED",
    };
    for (const [key, zar] of Object.entries(ALLOWANCE_ZAR)) {
      const target = zarToSettle(zar) + 2;
      const have = await client.getXrpBalance(wallets[key].address);
      const excess = round6(have - target);
      if (excess <= 0.5) {
        console.log(`  ok      ${key} holds ${have} XRP (R${zar} allowance + 2 XRP reserve)`);
        continue;
      }
      await submit(
        client,
        wallets[key],
        {
          TransactionType: "Payment",
          Account: wallets[key].address,
          Destination: wallets[sweepTo[key]].address,
          Amount: xrpToDrops(String(excess)),
        },
        `sweep ${excess} XRP from ${key} so it holds R${zar} + reserve`,
      );
    }
  }

  // 3. Ticket issuance
  console.log("\n3. Ticket issuance");
  if (process.env.ISSUANCE_ID) {
    console.log(`  reuse  ISSUANCE_ID ${process.env.ISSUANCE_ID}`);
  } else {
    const metadata = {
      ticker: "SIYA",
      name: DROP_DEFAULTS.name,
      desc: `${DROP_DEFAULTS.venue}, ${DROP_DEFAULTS.startsAt}`,
      asset_class: "other",
      issuer_name: "Siyangena",
    };
    const res = await submit(
      client,
      wallets.PROMOTER_SEED,
      {
        TransactionType: "MPTokenIssuanceCreate",
        Account: wallets.PROMOTER_SEED.address,
        AssetScale: 0,
        MaximumAmount: String(DROP_DEFAULTS.supply),
        // RequireAuth on, CanTransfer off: verified fans only, no fan-to-fan transfers.
        Flags: MPTokenIssuanceCreateFlags.tfMPTRequireAuth,
        MPTokenMetadata: convertStringToHex(JSON.stringify(metadata)),
      },
      `create ${DROP_DEFAULTS.supply} tickets for ${DROP_DEFAULTS.name}`,
    );
    setEnv("ISSUANCE_ID", res.result.meta.mpt_issuance_id);
    console.log(`  ISSUANCE_ID ${res.result.meta.mpt_issuance_id}`);
  }

  await client.disconnect();
  console.log("\nDone. .env is up to date. Next: npm run dev (backend), then npm run demo.");
  console.log("If the backend already ran with an older drop, delete backend/data.json first.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
