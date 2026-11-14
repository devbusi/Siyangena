# Siyangena

Event tickets that can't be scalped or faked. Buy tickets yourself, or set your limits and let an AI agent buy them the moment sales open. Built on the XRP Ledger for the W3Node Node Engine hackathon (Agentic Finance track).

## The problem

**For people buying tickets:** the events you want sell out in minutes, often before you even hear they're on. By the time you're in the queue, it's gone, and what's left is resold at two or three times the price or turns out to be fake.

**For promoters:** once tickets leave their hands, they have no control. Touts resell them at whatever they like, scammers sell fakes and screenshots in their name, and the promoter earns nothing from any of it.

## How it works

1. **Never miss it.** Add who you want to see to your wishlist. You get an alert the moment a match is listed and again when sales open.
2. **Get in first.** Buy directly, or send an agent in with your limit (how many, and the most per ticket). It buys the second sales open. Only you can change the limit.
3. **Verify once.** Each person gets one verified wallet, so bots and touts can't hold tickets.
4. **Promoters stay in control.** Each event is its own token on the ledger. Only verified wallets can hold it, it can't be sold off the platform, and resale only happens through Siyangena at or under the promoter's cap, with a fee for the promoter.
5. **Real tickets at the door.** Your ticket shows a code that changes every minute. The promoter scans it, and each ticket lets one person in.

## What the ledger guarantees

| Guarantee | How |
| --- | --- |
| Only the real ticket fits your wallet | Multi-Purpose Token with `RequireAuth` |
| No selling tickets off the platform | Token issued without `CanTransfer` |
| One person, one wallet | XRPL Credentials |
| Resale ticket and money move together | `Batch` with all-or-nothing |
| Agents can't overspend | Limits checked by the service on every purchase |

## Who does what

| Role | What they do |
| --- | --- |
| Ticket holder | Buys tickets, adds an agent, keeps a wishlist, resells, cashes out |
| Promoter | Gets approved, creates events, opens sales, scans tickets at the door, gets paid automatically |
| Admin | Approves promoters and events, sees payouts and Siyangena's earnings |

## Money

- Prices are in rand. Payments settle on the XRPL Testnet (RLUSD, or test XRP with `SETTLE_ASSET=XRP`).
- Adding money and cashing out use a test card and test bank. Every rand still moves on the ledger.
- Siyangena takes 5% of each promoter's sales before paying them out. Buyers pay face value.

## Try it

Three test accounts, all with the password `Siyangena-Test-2026`:

| Role | Email |
| --- | --- |
| Ticket holder | testuser@siyangena.test |
| Promoter | testpromoter@siyangena.test |
| Admin | testadmin@siyangena.test |

Test card: `4242 4242 4242 4242` (any expiry and CVC).

## Run it locally

You need Node 20 or newer and a [Supabase](https://supabase.com) project.

1. In the Supabase SQL editor, run the two files in `supabase/migrations`.
2. Copy `.env.example` to `.env` and `web/.env.example` to `web/.env`, then fill them in.
3. Install and start:

```bash
npm install
npm run setup          # funds the test wallets and issues demo tickets
npm run test-accounts  # creates the three test accounts
npm run dev            # backend on http://localhost:4000
npm run web            # app on http://localhost:5173
```

To run the whole flow end to end with ledger links, start the backend and run `npm run test-flow`.

## Project structure

```
web/       the app (React)
backend/   API and XRP Ledger logic (Express)
agent/     the buying agent and its tools (MCP)
shared/    types and settings used by all three
scripts/   setup, demo and test scripts
supabase/  database tables
```

## Deploy

- **Backend:** Render, using `render.yaml`.
- **App:** Vercel, using `vercel.json`.

Both read their settings from environment variables. See the two `.env.example` files.

## Team

Brian Mbana and Busisiwe Ndlovu.
