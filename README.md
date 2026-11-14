# Siyangena

Real tickets, no scalpers. People buy event tickets directly, or set limits and let an AI agent buy for them the moment sales open. Tickets can only be held by verified people, can't be passed around off the platform, and resell through Siyangena at a cap the promoter sets.

Built for the W3Node Node Engine hackathon, Agentic Finance track (Ripple and XRPL).

**Contents:** [The problem](#the-problem) · [How it works](#how-it-works) · [What enforces what](#what-enforces-what) · [Roles](#roles) · [Money](#money) · [Repo layout](#repo-layout) · [Run it](#run-it) · [Test it](#test-it) · [Deploy](#deploy) · [Team](#team)

## The problem

Bots buy out South African events in seconds and resell them at two or three times face value. People get scammed with fake tickets and screenshots. Promoters earn nothing on the resale market.

## How it works

1. **Verify once.** One real person gets one wallet credential. Bots and ticket farms can't hold tickets.
2. **Buy, or send an agent in.** Buying directly is the default. The agent is an add-on: the ticket holder sets how many tickets and the most to pay per ticket, and only they can change it.
3. **The agent buys at face value** within those limits when sales open, using tools exposed over MCP.
4. **Resale is fair.** Someone who can't go lists through Siyangena. The ticket and the money swap in one atomic step, at or below the promoter's cap, and the promoter earns a fee.
5. **Fakes fail.** A fake ticket or a direct person-to-person transfer is rejected by the ledger, not by a policy someone can ignore.

Around the sale:

- **Wishlist and alerts.** People add who they want to see (artist, event or vibe, a city and a max price). Matching events show on the wishlist straight away. Alerts come when a match is approved and listed, when sales open, and when a resale ticket under their max comes up. Every alert also goes out by SMS (a log placeholder for now, see `backend/src/lib/sms.ts`).
- **Demand for promoters.** On New event, promoters see how many people have a wish that fits what they're planning, and the most asked-for wishes.
- **Event review.** Every new event is checked by an admin before anyone can see it or sales can open. Until then the promoter sees the public page as people will see it, and edits details behind an edit button.
- **Categories.** Music, nightlife, sport, food and drink, comedy, arts and culture, festivals, family. The events list filters by them; towns go in the search box.
- **Door scanner.** Each ticket shows a QR code and a short typed code that change every minute. They're signed by the server and checked against the ledger, and each ticket a wallet holds lets one person in, so screenshots and copies don't get in.
- **Cancel an event.** The promoter types CANCEL and a message. Sales stop, every holder is refunded (face value, or what they paid on resale) and gets an alert. Not possible once sales have closed or the event has started.

## What enforces what

| Rule | Enforced by |
| --- | --- |
| A wallet only holds the real ticket for this event | XRPL MPT with `RequireAuth`; the platform approves each holder via `MPTokenAuthorize` |
| No person-to-person transfers | MPT issued without `CanTransfer`, so only the platform can move tickets |
| One person, one credential | XRPL Credentials (`DropVerifiedFan`), issued once per verified account |
| The agent can't overspend | The service checks the ticket holder's limits on every purchase |
| Resale at or under the cap | The service refuses listings over the cap; the platform co-signs every resale |
| Ticket and money move together | `Batch` with `tfAllOrNothing`: seller to platform, buyer pays seller, buyer pays fee, platform to buyer |
| Each agent only signs what it agreed to | The agent checks every inner transaction of the Batch before signing |
| Tickets per person | The service counts held and reserved tickets across primary sale and resale |
| Only checked promoters and events go on sale | Admin review of every promoter and every event before sales can open |
| One entry per ticket at the door | Signed, expiring codes, checked against the wallet's ticket balance on the ledger |

Each event is its own ticket issuance on the ledger, so tickets from different events never mix.

## Roles

Sign-up and sign-in use Supabase (email and password). After signing in, each role lands on its own home.

| Role | Can |
| --- | --- |
| Ticket holder | Every new account. Verify, add money, buy tickets, add an agent with limits, keep a wishlist, show tickets at the door, resell at the cap, cash out |
| Promoter | Apply as a registered business or an independent promoter. Once approved: create events (reviewed before going live), open and close sales, set tickets per person, the resale cap and fee, scan tickets at the door, cancel, and see payouts |
| Admin | Review promoters, events and changes to promoters' critical details (public name, registration number, bank account), manage roles, and see Siyangena's earnings and every payout |

Promoters and admins can switch to ticket holder mode from the + menu to buy tickets with the same account, never for their own events. Every account gets its own wallet, created by the server the first time it signs in; the seed is encrypted with `WALLET_ENCRYPTION_KEY` and never shown.

## Money

- **Settlement.** RLUSD on Testnet by default. `SETTLE_ASSET=XRP` (with `VITE_SETTLE_ASSET=XRP`) pays in test XRP instead, for when the RLUSD faucet isn't paying out. The app only ever shows rand.
- **Money in and out (Siyangena Pay, test).** Card (test card `4242 4242 4242 4242`, or `4000 0000 0000 0002` to see a decline) or instant EFT in, bank transfer out. The card and bank are simulated; every rand is a real ledger payment between the platform's bank wallet (its float) and the person's wallet. In production the gateway becomes a South African payment provider, and the float is converted to and from rand by a licensed exchange.
- **How Siyangena earns.** Buyers pay face value. Siyangena takes a commission (5% by default, `PLATFORM_FEE_PCT`) of each promoter's ticket sales and resale fees before paying them out.
- **Payouts are automatic.** Registered businesses are paid as tickets sell; independent promoters the morning after the event. Each payout moves on the ledger from the platform wallet to the bank wallet, then a (simulated) bank transfer goes out with a reference. Failures are retried.

## Repo layout

```
supabase/  SQL: profiles and roles, promoter applications, events, wallets, app state
shared/    types, network config and memo format shared by everything
backend/   Express API and XRPL logic
  src/app/api/            routes: me, promoter, admin, public events, live stream (SSE)
  src/application-logic/  accounts, events, sales, resale, agents, alerts, door,
                          cancel, payouts, money (the test gateway)
  src/xrpl/               ledger client, MPT, credentials, Batch, payments
agent/     the ticket holder's agent: MCP server, AI runner, Batch signer
web/       React app (installable on phones); promoter and admin views are desktop-first
scripts/   setup, the scripted demo, test accounts and the end-to-end flow
```

## Run it

You need Node 20+ and a network that can reach the XRPL Testnet.

1. In the Supabase SQL editor, run `supabase/migrations/001_accounts_roles_events.sql` and `002_profile_phone.sql`. Under Authentication, turn off "Confirm email" while testing.
2. Copy `.env.example` to `.env` and `web/.env.example` to `web/.env`, and fill them in. The backend needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `WALLET_ENCRYPTION_KEY`; the app needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_API_URL`.
3. Then:

```bash
npm install
npm run setup     # funds the platform and demo wallets, issues demo tickets, fills in .env
npm run dev       # backend on http://localhost:4000
npm run web       # app on http://localhost:5173
```

Add `ANTHROPIC_API_KEY` to `.env` to run the agent with the AI model. Without it, the agent falls back to a simple policy so the demo still works.

| Script | What it does |
| --- | --- |
| `npm run test-accounts` | Creates (or resets) a test account per role |
| `npm run test-flow` | Runs the whole flow against the running backend, with ledger links |
| `npx tsx scripts/test-accounts.ts --clean --yes` | Clean slate: deletes every other account, all events and saved app data (stop the backend first) |
| `npx tsx scripts/test-accounts.ts --reset-money` | Empties the test wallets back to R0 |
| `npm run bank` | Shows what the test bank wallet holds |
| `npm run demo` | The four scripted agent moments, end to end |
| `npm run agent -- --fan thandi --goal buy` | Starts one agent on its own |

`VITE_MOCK=1 npm run dev -w web` runs the whole app on simulated data, with a bar to switch between roles.

## Test it

The test accounts all use the password `Siyangena-Test-2026`:

| Role | Email |
| --- | --- |
| Ticket holder | testuser@siyangena.test |
| Promoter (approved, registered business) | testpromoter@siyangena.test |
| Admin | testadmin@siyangena.test |

1. As the promoter, create an event. It goes to review.
2. As the admin, open Review, Events and approve it. As the promoter, open sales.
3. As the ticket holder, add a wish, verify, add money with the test card, and buy tickets (or send an agent in).
4. Show the ticket at the door; as the promoter, scan it in Door scanner. Scan it again: already used.
5. Check the automatic payout and Siyangena's fee in Payouts, cash out from Wallet, and cancel a test event to see everyone refunded.

The scripted demo shows the agent moments: an agent buying the second sales open, an agent stopping at its limit, an over-cap listing refused, a fair resale swapping ticket and money in one step, and a fake ticket and an off-platform transfer failing on the ledger.

## Deploy

- **Backend on Render:** New, Blueprint, pick this repo (it reads `render.yaml`). Fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WALLET_ENCRYPTION_KEY`, `PROMOTER_SEED` and `BANK_SEED` from your local `.env`, then `CORS_ORIGIN` and `APP_URL` (your Vercel address) and optionally `ANTHROPIC_API_KEY`.
- **App on Vercel:** import the repo with the root left as is (it reads `vercel.json`). Add `VITE_API_URL` (your Render address plus `/api`), `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_XRPL_NETWORK=testnet` and `VITE_SETTLE_ASSET=XRP`.
- **Supabase:** set Authentication, URL Configuration, Site URL to your Vercel address.

## Team

Brian Mbana and Busisiwe Ndlovu.
