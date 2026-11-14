// The four demo moments, end to end, with explorer links.
// Run after: npm run setup, then npm run dev (backend) in another terminal.
//   npm run demo
// To run it again from scratch: empty ISSUANCE_ID in .env, delete backend/data.json,
// npm run setup, restart the backend.
import "../agent/src/env";
import { Client, convertStringToHex, MPTokenIssuanceCreateFlags, Wallet } from "xrpl";
import { ACTIVE, explorerTxUrl, type Drop, type Fan } from "@drop/shared";
import * as tools from "../agent/src/tools";
import { settleAmountFor } from "../agent/src/signer";

const BASE = (process.env.BACKEND_URL || "http://localhost:4000").replace(/\/$/, "") + "/api";
const HUMAN: Record<string, string> = process.env.HUMAN_API_KEY ? { Authorization: `Bearer ${process.env.HUMAN_API_KEY}` } : {};
const links: string[] = [];

async function human(method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...HUMAN },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!json.success) throw new Error(`${method} ${path}: ${json.code ?? res.status} ${json.message ?? ""}`);
  return json.data;
}

const title = (t: string) => console.log(`\n\n=== ${t} ===`);
const line = (t: string) => console.log(`  ${t}`);
function show(label: string, result: any) {
  line(`${label}: ${JSON.stringify(result)}`);
  for (const v of Object.values(result ?? {})) {
    if (typeof v === "string" && v.startsWith("http")) links.push(`${label}: ${v}`);
  }
}

async function ledgerTx(client: Client, wallet: Wallet, tx: any, label: string) {
  const res: any = await client.submitAndWait(tx, { autofill: true, wallet }).catch((e) => ({ error: e }));
  if (res.error) {
    line(`${label}: rejected before validation (${res.error.data?.engine_result ?? res.error.message})`);
    return null;
  }
  const code = res.result.meta?.TransactionResult;
  const url = explorerTxUrl(res.result.hash);
  line(`${label}: ${code}  ${url}`);
  links.push(`${label} (${code}): ${url}`);
  return res;
}

async function main() {
  const client = new Client(ACTIVE.wss);
  await client.connect();
  const drop: Drop = await human("GET", "/drop");
  const fans: Fan[] = await human("GET", "/fans");
  const agentOf = (id: string) => fans.find((f) => f.id === id)!.agentAddress;
  console.log(`Siyangena demo on ${ACTIVE.name}: ${drop.name}, ${drop.supply} tickets at R${drop.priceZar}, cap R${drop.resaleCapZar}`);

  title("Prep: humans set mandates, promoter verifies fans");
  for (const [id, quantity, ceilingZar] of [["thandi", 2, 1500], ["sipho", 1, 1500], ["scalper", 1, 1200]] as const) {
    await human("PUT", `/fans/${id}/mandate`, { quantity, ceilingZar });
    line(`${id}: mandate ${quantity} ticket(s), max R${ceilingZar} each`);
    const fan = await human("POST", `/fans/${id}/verify`);
    line(`${id}: verified fan, credential + ticket opt-in done${fan.authTx ? `  ${explorerTxUrl(fan.authTx)}` : ""}`);
  }

  title("Moment 1: sales open, agents buy on their own");
  await human("POST", "/promoter/drop/open");
  show("Thandi's agent buys 2", await tools.buyTicket("thandi", 2, "Sales opened at R1,200, under my R1,500 ceiling."));
  show("Scalper's agent buys the last 1", await tools.buyTicket("scalper", 1, "Buying to resell."));
  const after: Drop = await human("GET", "/drop");
  line(`Event state: ${after.state} (${after.sold}/${after.supply} sold)`);

  title("Moment 2: scalper offer, agent declines, a rogue attempt is blocked twice");
  const scalp: any = await tools.listForResale("scalper", 1700, "Reselling above face value.");
  show("Scalper lists at R1,700", scalp);
  const listings: any = await tools.browseResale();
  const offer = listings.open.find((l: any) => l.listingId === scalp.listingId);
  line(`Sipho's agent: R${offer.totalZar} all-in is over his R1,500 ceiling, so it declines.`);
  show("Rogue agent forces the purchase anyway", await tools.acceptResale("sipho", scalp.listingId, "Forced by a rogue agent."));
  const sipho = Wallet.fromSeed(process.env.SIPHO_AGENT_SEED!);
  await ledgerTx(
    client,
    sipho,
    { TransactionType: "Payment", Account: sipho.address, Destination: agentOf("scalper"), Amount: settleAmountFor(1700) },
    "Rogue agent pays the scalper R1,700 directly (wallet only holds R1,500)",
  );

  title("Moment 3: Thandi can't go, atomic resale to Sipho, then an over-cap listing");
  const listing: any = await tools.listForResale("thandi", 1250, "My human can't go.");
  show("Thandi's agent lists at R1,250", listing);
  const sellerSigns = (async () => {
    for (let i = 0; i < 30; i++) {
      const r: any = await tools.signMyResales("thandi");
      if (r.signed?.length) return r;
      await new Promise((res) => setTimeout(res, 1500));
    }
  })();
  const [bought] = await Promise.all([
    tools.acceptResale("sipho", listing.listingId, "R1,312.50 all-in fits my R1,500 ceiling."),
    sellerSigns,
  ]);
  show("Sipho's agent buys it in one atomic swap", bought);
  const greedy: any = await tools.listForResale("thandi", 2500, "Testing a high price.");
  show("Thandi lists her other ticket at R2,500", greedy);
  show("Promoter refuses to co-sign over the R1,800 cap", await tools.acceptResale("sipho", greedy.listingId, "Trying the R2,500 listing."));

  title("Moment 4: fakes and off-platform sales fail on the ledger");
  const scammer = Wallet.fromSeed(process.env.SCAMMER_SEED!);
  const fake: any = await ledgerTx(
    client,
    scammer,
    {
      TransactionType: "MPTokenIssuanceCreate",
      Account: scammer.address,
      AssetScale: 0,
      MaximumAmount: "100",
      Flags: MPTokenIssuanceCreateFlags.tfMPTCanTransfer,
      MPTokenMetadata: convertStringToHex(JSON.stringify({ ticker: "SIYA", name: drop.name })),
    },
    "Scammer creates a look-alike ticket",
  );
  if (fake) {
    await ledgerTx(
      client,
      scammer,
      {
        TransactionType: "Payment",
        Account: scammer.address,
        Destination: agentOf("thandi"),
        Amount: { mpt_issuance_id: fake.result.meta.mpt_issuance_id, value: "1" },
      },
      "Scammer sends the fake ticket to Thandi",
    );
  }
  const thandi = Wallet.fromSeed(process.env.THANDI_AGENT_SEED!);
  await ledgerTx(
    client,
    thandi,
    {
      TransactionType: "Payment",
      Account: thandi.address,
      Destination: agentOf("sipho"),
      Amount: { mpt_issuance_id: drop.issuanceId, value: "1" },
    },
    "Thandi sends a ticket straight to Sipho, off-platform",
  );

  title("Explorer links for the video and README");
  for (const l of links) line(l);
  const stats = await human("GET", "/promoter/stats");
  line(`Promoter stats: ${JSON.stringify(stats)}`);
  await client.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
