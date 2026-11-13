# Prompt: build Drop (paste this into your coding agent)

You are helping Brian and Busi finish a hackathon project today. We submit by 23:00 SAST (hard deadline 23:59). Work fast, keep scope tight, favour a working, polished demo over extra features.

The agreed plan, repo structure and API contract are in `docs/PLAN.md`. Read it first. It overrides anything below that disagrees with it.

Work one task at a time. After each task: run it, commit with a clear message, tell me what changed in two or three lines, and wait for my go-ahead before the next one.

## The product

Drop: AI agents that get fans the tickets and limited drops they want, on a ledger that makes scalping and ticket scams impossible.

- A promoter issues tickets as Multi-Purpose Tokens (MPTs) on the XRP Ledger.
- Only fans holding a "verified fan" Credential can hold tickets.
- Each fan gives their AI agent a mandate: event, quantity, price ceiling. The fan sets it in the web app; the promoter service stores it; the agent can only read it.
- When the drop opens, the agent buys on its own within that mandate.
- If a fan cannot go, their agent resells to another fan's agent in one atomic Batch, at or below the promoter's price cap. The promoter earns a fee on every resale.
- Fake tickets and off-platform resales fail on the ledger.

## Hackathon rules (Ripple, Agentic Finance track)

- At least one XRPL Testnet (or Devnet) transaction executed autonomously by an agent.
- Limits enforced somewhere the agent does not control (ledger or an independent service).
- A human can set or change the limits outside the agent.
- The demo must show the agent getting blocked, not only the happy path.
- XRPL mainnet features only. No EVM sidechain.
- Expose the agent's XRPL actions as MCP tools.

## Stack

TypeScript throughout, npm workspaces. **`xrpl@^5.3`** (not v4: 5.0.0 and older produce Batch signatures that BatchV1_1 rejects). Express for `backend/`, `@modelcontextprotocol/sdk` for `agent/`, `@anthropic-ai/sdk` for the runner, Next.js for `web/` (Busi owns it). Run TS with `tsx`.

## Task order

1. `scripts/preflight.ts`: connect to Testnet and Devnet, print `server_info` build version and whether `BatchV1_1`, `fixBatchV1_2`, `MPTokensV1` and `Credentials` are enabled (use the `feature` command). Confirm the Testnet RLUSD issuer `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV` exists (from Ripple's docs). Print `npm ls xrpl`. Then stop and report.
2. Network choice: Testnet + RLUSD if BatchV1_1 is enabled there, else Devnet + XRP. Put it in `shared/config.ts` so one switch changes everything.
3. Batch spike in `scripts/spike-batch.ts`: throwaway wallets, MPT with `tfMPTRequireAuth` and no `tfMPTCanTransfer`, then the 4-inner resale Batch from `docs/PLAN.md` section 4. Print every inner result. If it does not work within 45 minutes, stop and tell me; fallback is a promoter-mediated swap.
4. `shared/` types matching the API contract, and `.env.example`. Commit early so Busi can build against them.
5. `scripts/setup.ts`: reuse `issue-ticket.mjs`. Fund the demo cast, trust lines, issuance, opt-ins, write addresses and seeds to `.env`.
6. Backend: drop state, Credentials, authorisation, mandates, primary sale watcher, SSE.
7. Agent: MCP server, `signer.ts`, runner.
8. Resale flow end to end.
9. `scripts/demo.ts`: all four demo moments, printing explorer links.

## BatchV1_1 rules that matter

- Outer `Account` is the promoter. Seller and buyer go in `BatchSigners`, sorted by account. Use `client.autofill(batch, 2)`, `signMultiBatch`, `combineBatchSigners`.
- Set the outer `Account` and `Sequence` before anyone signs. Only `Fee` may change after. The promoter signs and submits last.
- All promoter transactions go through one queue (mutex), or a pending Batch's Sequence goes stale.
- Inner transactions need `tfInnerBatchTxn`, `Fee: "0"`, empty `SigningPubKey`.
- An outer `tesSUCCESS` does not mean the inner transactions succeeded. Look each one up.
- Keep "ticket seller to promoter" as the first inner transaction so supply is free when sold out.

## Enforcement

| Rule | Enforced by |
| --- | --- |
| Agent cannot spend more than the fan funded | Ledger: agent wallet only holds ceiling x quantity |
| Per-ticket ceiling and quantity | Promoter service: checks the human-set mandate on every sale and resale |
| Only verified fans can hold tickets | Ledger: `tfMPTRequireAuth`; service authorises only accepted Credential holders |
| Max 4 per fan, one Credential per verified person | Promoter service |
| No off-platform resale | Ledger: no `tfMPTCanTransfer` |
| Fake tickets rejected | Ledger: fans only opt in to the official issuance ID |
| Resale price capped | Promoter only co-signs the Batch at or under the cap |
| Resale is all or nothing | Ledger: Batch `tfAllOrNothing` |

## Payments

- RLUSD on Testnet needs a trust line on every holding account. Claim test RLUSD at tryrlusd.com into one bank wallet; `setup.ts` distributes it.
- If RLUSD blocks us for more than 30 minutes, use XRP and keep RLUSD in the pitch.
- Reserves: 1 XRP base plus 0.2 XRP per owned object. Fund from the faucet.
- Every agent payment carries a memo with the mandate ID, request ID and a short reason.

## Rules

- Never commit seeds. `.env` is in `.gitignore`; `.env.example` has empty values.
- Commit small and often.
- Keep the README current: what Drop is, architecture diagram, enforcement table, how to run, Testnet transaction links.
- No extra features until all four demo moments work end to end.
- If XRPL behaves differently from this, stop and tell me before working around it.
