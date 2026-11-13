# Drop: build plan, repo structure, API contract

Status: agreed draft, Fri 13 Nov 2026. Times are SAST. Put this file in the repo as `docs/PLAN.md`.

## What changed from the original prompt (read first)

1. **Batch is now `BatchV1_1`.** The original Batch amendment was disabled over a security flaw and replaced. It is live on Mainnet (since 9 Oct 2026) and Devnet. Sources disagree about Testnet, so we check it ourselves (preflight).
2. **Use `xrpl@^5.3`, not v4.** xrpl.js 5.0.0 produced Batch signatures that BatchV1_1 rejects; 5.1.0 fixed it. Latest is 5.3.0. `issue-ticket.mjs` may need small fixes.
3. **BatchV1_1 signing order.** The Batch `Account` (promoter) and `Sequence` must be set before seller and buyer sign. The promoter signs and submits last. All promoter transactions go through one queue so nothing changes the promoter's Sequence mid-signing.
4. **Network rule.** If Testnet has BatchV1_1: Testnet + RLUSD. If not: Devnet + XRP (RLUSD stays in the pitch; RLUSD only exists on Mainnet and Testnet). Fallback if Batch fails on both: promoter-mediated swap, noted in README.
5. **Mandate lives in the promoter service.** The allowance balance only caps the total spend. The per-ticket ceiling and quantity are set by the human in the web app, stored by the promoter service, read-only to the agent, and checked on every sale.
6. **Demo 2 changed.** A model saying "no" is not enforcement. We show the agent declining, then a forced "rogue agent" attempt blocked by the service and by the ledger.
7. **Honest enforcement table.** Max 4 per fan and one Credential per verified person are enforced by the promoter service. The ledger enforces opt-in, RequireAuth, no fan-to-fan transfer, balances and Batch atomicity.

## 1. Build plan

| Time | Brian | Busi |
| --- | --- | --- |
| 15:30 to 15:45 | Preflight (`scripts/preflight.ts`). Scaffold repo, `shared/` types, `.env.example`. **15:45: pick network, tell Busi.** | Next.js scaffold, mock data from `shared/` types |
| 15:45 to 16:30 | Batch spike: one 4-inner resale Batch with throwaway wallets. **16:30: if not working, switch to promoter-mediated swap.** | Fan screens on mock: verify, mandate, live drop |
| 16:30 to 17:45 | `setup.ts` (port `issue-ticket.mjs`), promoter service: drop state, Credentials, authorisation, mandates, primary sale watcher, SSE | Fan screens: my tickets, "I can't go" |
| 17:45 to 19:00 | Agent MCP server and runner; resale flow (listing, signing, cap check) | Promoter dashboard, live feed on mock SSE |
| 19:00 to 20:15 | Integration, `demo.ts` running all four moments. **20:15 feature freeze.** | Integration, polish |
| 20:15 to 21:30 | Deploy (Railway backend, Vercel web), fixes, README with tx links | Polish, rehearsal |
| 21:30 to 22:30 | Record demo video together | |
| By 23:00 | Submit title, repo URL, video URL | |

## 2. Demo cast and numbers

Prices shown in ZAR, settled in RLUSD (or XRP on Devnet) at a fixed demo rate in `shared/config.ts`.

- Drop: supply 3, face value R1,200, max 4 per fan, resale cap R1,800, resale fee 5% paid by buyer.
- Thandi (fan A): mandate 2 tickets, all-in ceiling R1,500 each. Agent wallet funded R3,000.
- Sipho (fan B): misses the drop. Mandate 1 ticket, ceiling R1,500. Agent wallet funded R1,500.
- Scalper: verified, bought 1 at face. Lists at R1,700 (under cap, above Sipho's ceiling).
- Scammer: unverified, issues their own "Drop Ticket" MPT.

Each fan has a main wallet (funds the agent) and an agent wallet (holds the Credential, the tickets and the allowance).

## 3. Demo moments mapped to enforcement

1. **Drop opens.** Thandi's agent pays R2,400 with memos; service sends 2 tickets. Scalper buys the last one; sold out.
2. **Scalper offer.** Sipho's agent sees the R1,700 listing and declines. Then a forced "rogue agent" attempt: service returns `403 MANDATE_EXCEEDED`, and a direct payment to the scalper fails on the ledger for lack of funds (explorer link).
3. **Resale.** Thandi can't go. Her agent lists at R1,250; Sipho's agent accepts; one Batch settles; promoter earns R62.50. Then a listing at R2,500: promoter refuses to co-sign, so it can never reach the ledger.
4. **Fakes.** Scammer sends the fake MPT to Thandi: ledger rejects (no opt-in). Thandi sends a ticket straight to Sipho: ledger rejects (no `tfMPTCanTransfer`).

## 4. Atomic resale Batch

`Batch`, `tfAllOrNothing`, outer `Account` = promoter, `BatchSigners` = seller and buyer (sorted by account).

1. Ticket MPT: seller to promoter (must be first, so supply is free when sold out)
2. RLUSD: buyer to seller (price)
3. RLUSD: buyer to promoter (fee)
4. Ticket MPT: promoter to buyer

Flow: service autofills (with signer count 2), locks promoter Sequence, emits `resale.sign_requested`, both agents sign via `signer.ts`, promoter checks cap, signs last, submits. Check each inner transaction's result, not just the outer `tesSUCCESS`.

## 5. Repo structure

```
drop/
  package.json            npm workspaces: shared, backend, agent, web, scripts
  .env.example            empty values only
  README.md
  docs/PLAN.md            this file
  shared/src/
    types.ts              every request, response and event type below
    config.ts             network URLs, RLUSD issuer, FX rate, explorer base
  backend/src/
    index.ts              Express app, routes, SSE
    xrpl/client.ts        one Client, reconnect, promoter tx queue (mutex)
    xrpl/mpt.ts           issuance, authorise holder, send ticket
    xrpl/credentials.ts   CredentialCreate, check accepted credential
    xrpl/batch.ts         build resale Batch, collect BatchSigners, submit
    drop.ts               open/closed, price, supply, caps
    mandates.ts           human-set limits; agents read only
    sales.ts              subscribe to promoter account, match memo, send or refund
    resale.ts             listings, cap check, signing flow
    events.ts             event bus feeding SSE
    store.ts              in-memory, persisted to data.json
  agent/src/
    mcp-server.ts         MCP server (stdio), registers tools
    tools/                one file per tool
    signer.ts             deterministic Batch check before signing (not the LLM)
    runner.ts             Claude via Anthropic API + MCP client; one process per fan
    wallet.ts             agent wallet from .env
  web/                    Next.js app router
    app/(fan)/...         verify, mandate, drop, tickets
    app/promoter/...      create drop, caps, live feed, revenue
    lib/api.ts            typed client from shared/
    lib/mock.ts           mock data + fake SSE until backend is live
  scripts/
    preflight.ts          amendment and version checks
    setup.ts              fund wallets, trust lines, issuance, write .env
    demo.ts               the four moments, prints explorer links
```

## 6. API contract (backend, port 4000)

Money fields are strings. `zar` is display, `rlusd` is what settles. Anything that touches the ledger returns `txHash` and `explorerUrl`.

### Drop

- `GET /drop` returns `Drop`:
  `{ id, name, venue, startsAt, state: "scheduled" | "open" | "sold_out" | "closed", priceZar, priceRlusd, supply, sold, maxPerFan, resaleCapZar, resaleFeePct, issuanceId }`
- `POST /promoter/drop` body `{ name, venue, startsAt, priceZar, supply, maxPerFan, resaleCapZar, resaleFeePct }` creates the MPT issuance, returns `Drop`.
- `POST /promoter/drop/open`, `POST /promoter/drop/close` return `Drop`.
- `PATCH /promoter/drop` body `{ resaleCapZar?, resaleFeePct? }` returns `Drop`.
- `GET /promoter/stats` returns `{ sold, revenueRlusd, resales, feesRlusd }`.

### Fans

- `GET /fans` returns `Fan[]` (demo cast from setup).
  `Fan = { id, name, address, agentAddress, verified, credentialTx?, authTx? }`
- `POST /fans/:id/verify` issues the Credential to the agent wallet, it accepts, promoter authorises the MPT. Returns `Fan`.
- `GET /fans/:id/wallet` returns `{ allowanceRlusd, allowanceZar, xrp, tickets }`.
- `GET /fans/:id/tickets` returns `{ count, history: LedgerItem[] }`.

### Mandates (human only; the agent can read, never write)

- `PUT /fans/:id/mandate` body `{ quantity, ceilingZar }` returns `Mandate`.
  `Mandate = { id, fanId, quantity, ceilingZar, bought, status: "active" | "filled" | "cancelled" }`
- `GET /fans/:id/mandate` returns `Mandate`.

### Primary sale

- `POST /sales/intents` body `{ fanId, quantity }` returns `{ requestId, payTo, amountRlusd, memo }`, or `403 MANDATE_EXCEEDED | LIMIT_PER_FAN | NOT_VERIFIED`, or `409 SOLD_OUT | NOT_OPEN`.
- The agent then submits the Payment itself with that memo. The service matches it and sends tickets, or refunds anything that does not match an intent.

### Resale

- `GET /resale/listings` returns `Listing[]`.
  `Listing = { id, sellerFanId, priceZar, feeZar, totalZar, status: "open" | "signing" | "settled" | "refused" }`
- `POST /resale/listings` body `{ fanId, priceZar }` returns `Listing`.
- `POST /resale/listings/:id/accept` body `{ buyerFanId }` returns `{ batchId, batch }` or `403 CAP_EXCEEDED | MANDATE_EXCEEDED`.
- `POST /resale/batches/:batchId/signatures` body `{ fanId, signedBatch }`. When both have signed, the promoter checks the cap, signs last, submits. Returns `{ status, txHash?, explorerUrl?, innerResults? }`.

### Agent log

- `POST /agent-log` body `{ fanId, mandateId, tool, reason, txHash? }` so the live view shows what the agent did and why.

### Events: `GET /events` (SSE)

`{ type, at, fanId?, listingId?, message, txHash?, explorerUrl? }` with `type` one of:
`drop.opened, drop.sold_out, sale.intent, sale.paid, sale.ticket_sent, sale.refunded, agent.action, mandate.blocked, resale.listed, resale.sign_requested, resale.settled, resale.refused, ledger.rejected`

## 7. MCP tools (agent)

| Tool | Calls | Notes |
| --- | --- | --- |
| `get_drop_status` | `GET /drop` | |
| `get_mandate` | `GET /fans/:id/mandate` | read only |
| `get_wallet_balance` | ledger | agent wallet |
| `buy_ticket(quantity, reason)` | `POST /sales/intents`, then Payment | agent submits the Payment itself |
| `browse_resale` | `GET /resale/listings` | |
| `accept_resale(listingId, reason)` | accept, sign, post signature | |
| `list_for_resale(priceZar, reason)` | `POST /resale/listings` | seller signs on `resale.sign_requested` via `signer.ts` |

`signer.ts` only signs a Batch whose inner transactions exactly match the listing (accounts, amounts, issuance ID). That check is code, not the model.
