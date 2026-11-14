// Shows what the test bank wallet holds. Run: npm run bank
import path from "path";
import dotenv from "dotenv";
import { Client, Wallet } from "xrpl";

dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ACTIVE, RLUSD_CURRENCY_HEX } = require("@drop/shared") as typeof import("@drop/shared");

async function main() {
  const seed = process.env.BANK_SEED;
  if (!seed) throw new Error("BANK_SEED is empty in .env. Run npm run setup first.");
  const address = Wallet.fromSeed(seed).address;
  const client = new Client(ACTIVE.wss);
  await client.connect();
  try {
    console.log(`Network:  ${ACTIVE.name} (${ACTIVE.wss})`);
    console.log(`Bank:     ${address}`);
    console.log(`XRP:      ${await client.getXrpBalance(address).catch(() => "account not found")}`);
    console.log(`App pays in RLUSD from issuer ${ACTIVE.rlusdIssuer}\n`);
    const res: any = await client.request({ command: "account_lines", account: address, ledger_index: "validated" });
    if (!res.result.lines.length) console.log("No token lines at all.");
    for (const l of res.result.lines) {
      const name = l.currency === RLUSD_CURRENCY_HEX ? "RLUSD" : l.currency;
      const match = l.account === ACTIVE.rlusdIssuer ? "  <- the one the app uses" : "";
      console.log(`${name.padEnd(8)} ${String(l.balance).padStart(12)}  issuer ${l.account}${match}`);
    }
  } finally {
    await client.disconnect();
  }
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
