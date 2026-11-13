# Siyangena

Real tickets, no scalpers. Fans set limits, and an AI agent buys event tickets for them the moment sales open. Tickets can only be held by verified fans, can't be passed around off the platform, and resell through the promoter at a cap the promoter sets.

Built for the W3Node Node Engine hackathon, Agentic Finance track (Ripple and XRPL).

## The problem

Bots buy out South African events in seconds and resell them at two or three times face value. Fans get scammed with fake tickets and screenshots. Promoters earn nothing on the resale market.

## How it works

1. **Fan verifies once.** One real person gets one wallet credential. Bots and ticket farms can't hold tickets.
2. **Fan sets limits.** How many tickets, the most to pay per ticket, and an allowance the agent can spend. Only the fan can change them.
3. **The agent buys.** When sales open, the fan's agent buys at face value within those limits, using tools exposed over MCP.
4. **Resale is fair.** A fan who can't go lists through Siyangena. The ticket and the money swap in one atomic step, at or below the promoter's cap, and the promoter earns a fee.
5. **Fakes fail.** A fake ticket or a direct fan-to-fan transfer is rejected by the ledger, not by a policy someone can ignore.

The promoter decides the rules per event: supply, price, tickets per fan, resale cap and resale fee. They can change the per-fan limit, cap and fee from the control room.

## What enforces what

| Rule | Enforced by |
| --- | --- |
| A wallet only holds the real ticket for this event | XRPL MPT with `RequireAuth`, promoter approves each holder via `MPTokenAuthorize` |
| No fan-to-fan transfers | MPT issued without `CanTransfer`, so only the promoter can move tickets |
| One person, one credential | XRPL Credentials (`DropVerifiedFan`), issued after ID and selfie check |
| The agent can't overspend | The agent wallet only holds the fan's allowance; the service also checks the mandate |
| Resale at or under the cap | Service refuses listings over the cap; the promoter co-signs every resale |
| Ticket and money move together | `Batch` with `tfAllOrNothing`: seller to promoter, buyer pays seller, buyer pays fee, promoter to buyer |
| Each agent only signs what it agreed to | The agent checks every inner transaction of the Batch before signing |
| Tickets per fan | Service counts held and reserved tickets across primary sale and resale |

Payments settle in RLUSD on Testnet (or XRP on Devnet). The app shows rands only, and the blockchain stays invisible to fans.

## Repo layout

```
shared/    types, network config and memo format shared by everything
backend/   Express API, promoter wallet, XRPL logic, live event stream (SSE)
agent/     the fan's agent: MCP server with 9 tools, Claude runner, Batch signer
web/       React app for fans and promoters
scripts/   setup (wallets, allowances, ticket issuance) and the scripted demo
```

## Run it

You need Node 20+ and a network that can reach the XRPL Testnet or Devnet.

```bash
npm install
npm run setup     # creates .env, funds the demo wallets, issues tickets
npm run dev       # backend on http://localhost:4000
npm run web       # app on http://localhost:5173
```

Set `HUMAN_API_KEY` in `.env` and the same value as `VITE_HUMAN_API_KEY` in `web/.env` so the app can save limits and promoter rules. Agents never get this key.

Add `ANTHROPIC_API_KEY` to `.env` to run the agent on Claude. Without it, the agent falls back to a simple policy so the demo still works.

Start an agent on its own:

```bash
npm run agent -- --fan thandi --goal buy
npm run agent -- --fan sipho --goal resale
npm run agent -- --fan thandi --goal sell --price 1250
```

Or run all four demo moments end to end, with explorer links printed at the end:

```bash
npm run demo
```

### Preview without a ledger

`VITE_MOCK=1 npm run dev -w web` runs the whole app on simulated data, including the agent feed, resale and the bad-actor buttons in the promoter control room.

## The demo moments

1. Thandi's agent buys 2 tickets the second sales open. A scalper's agent buys 1.
2. The scalper lists at R1,700. Sipho's agent passes because it's over his limit. A direct sale off the platform fails on the ledger.
3. Thandi can't go and lists at R1,250. Sipho's agent buys it, and the ticket and money swap in one step. A listing above the cap is refused.
4. A scammer's fake ticket and a fan-to-fan send both fail.

## Team

Brian Mbana and Busisiwe Ndlovu.
