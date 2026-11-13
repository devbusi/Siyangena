# Drop: start here (Brian)

Three files in this pack:

- `START-HERE.md`: this file. How to get going in the next 15 minutes.
- `drop-build-plan.md`: plan, timings, demo cast, API contract. Goes in the repo as `docs/PLAN.md`.
- `AGENT-PROMPT.md`: paste into your coding agent (Claude Code or similar) once the plan is in the repo.

## The 7 things that changed from the first prompt

1. Batch is now the `BatchV1_1` amendment. Live on Mainnet and Devnet; Testnet unclear, so we check.
2. Use `xrpl@^5.3`. v4 and 5.0.0 make Batch signatures that BatchV1_1 rejects.
3. In a Batch, the promoter's `Account` and `Sequence` are fixed before seller and buyer sign. Promoter signs last. One queue for all promoter transactions.
4. If Testnet has no BatchV1_1, we use Devnet + XRP (no RLUSD on Devnet).
5. The fan's mandate is stored by the promoter service and checked on every sale. The agent can only read it.
6. Demo 2: the agent declines, then a forced "rogue agent" attempt is blocked by the service and the ledger.
7. Max 4 per fan and one Credential per person are service rules, not ledger rules. We say so.

## Get started

**1. Repo (2 min)**

```bash
git checkout -b build
mkdir -p docs scripts
cp drop-build-plan.md docs/PLAN.md
npm init -y && npm pkg set type=module
npm i xrpl@^5.3 && npm i -D tsx typescript @types/node
echo ".env" >> .gitignore
git add -A && git commit -m "Add build plan"
```

**2. Preflight (5 min).** Save as `scripts/preflight.ts`, run `npx tsx scripts/preflight.ts`, send Busi the output.

```ts
import { Client } from "xrpl";

const NETWORKS: Record<string, string> = {
  testnet: "wss://s.altnet.rippletest.net:51233",
  devnet: "wss://s.devnet.rippletest.net:51233",
};
const WATCH = ["BatchV1_1", "fixBatchV1_2", "MPTokensV1", "Credentials"];
const RLUSD_TESTNET_ISSUER = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";

async function main() {
  for (const [name, url] of Object.entries(NETWORKS)) {
    const client = new Client(url);
    await client.connect();
    const info: any = await client.request({ command: "server_info" });
    const res: any = await client.request({ command: "feature" } as any);
    const features = Object.values(res.result.features) as any[];
    console.log(`\n${name} (build ${info.result.info.build_version})`);
    for (const want of WATCH) {
      const f = features.find((x) => x.name === want);
      console.log(`  ${want}: ${f ? (f.enabled ? "ENABLED" : "not enabled") : "unknown to this server"}`);
    }
    if (name === "testnet") {
      try {
        await client.request({ command: "account_info", account: RLUSD_TESTNET_ISSUER });
        console.log("  RLUSD issuer: found");
      } catch {
        console.log("  RLUSD issuer: NOT found");
      }
    }
    await client.disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Not run yet (our build sandbox can't reach XRPL), so expect a small fix or two.

**3. Decide the network (at 15:45).** `BatchV1_1: ENABLED` on Testnet means Testnet + RLUSD. Otherwise Devnet + XRP.

**4. Paste `AGENT-PROMPT.md` into your coding agent.** It starts at task 1 (preflight, done), so tell it to skip to task 2. It stops after each task for your go-ahead.

**5. Push `shared/` types by 16:15** so Busi can build the web app against the real contract.

## .env.example

```
XRPL_NETWORK=
XRPL_WSS=
RLUSD_ISSUER=
FX_ZAR_PER_RLUSD=
PROMOTER_SEED=
BANK_SEED=
THANDI_SEED=
THANDI_AGENT_SEED=
SIPHO_SEED=
SIPHO_AGENT_SEED=
SCALPER_AGENT_SEED=
SCAMMER_SEED=
ISSUANCE_ID=
ANTHROPIC_API_KEY=
BACKEND_URL=http://localhost:4000
```

## Checkpoints

- 15:45 network picked
- 16:30 Batch spike works, or we switch to the promoter-mediated swap
- 20:15 feature freeze
- 21:30 recording
- 23:00 submitted
