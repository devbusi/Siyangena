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

**Around the sale:**

- **Wishlist and alerts.** Fans add who they want to see (artist, event or vibe, a city and a max price). They get an alert when a matching event is listed, when sales open, and when a resale ticket under their max comes up. Each alert has Buy tickets and Send my agent in right there. The agent only ever buys on Siyangena.
- **Demand for promoters.** On New event, promoters see how many fans have a wish that fits what they're planning, and the most asked-for wishes in that city.
- **Door scanner.** Each ticket shows a QR code, and a short code staff can type, that change every minute. The promoter scans it at the door. The code is signed by the server and checked against the ledger, and each ticket a wallet holds lets one person in, so screenshots and copies don't get in.
- **Cancel an event.** The promoter types CANCEL and a message for fans. Sales stop, every holder is refunded to their wallet from the platform wallet (face value, or what they paid on resale), and fans get an alert with the message.
- **Categories.** Every event has a kind (music, nightlife, sport, food and drink, comedy, arts and culture, festivals, family), and the events list filters by it.
- **Event review.** Every new event from a promoter is checked by an admin before fans can see it or sales can open. The admin approves it or asks for changes with a note. Until then the promoter sees the public page as people will see it, and can edit the details behind an edit button.
- **Payouts, per event.** Promoters see ticket sales, resale fees, refunds, what's held and what's been paid, per event. Registered businesses can be paid as tickets sell. Independent promoters are paid the morning after the event. Payouts are automatic: as soon as an event's money is due, it moves from the platform wallet to the bank wallet on the ledger and a (simulated) bank transfer with a reference goes to the promoter. Anything that fails is retried, and admins can send it again.
- **Money in and out (Siyangena Pay, test).** Fans add money by card (test card 4242 4242 4242 4242, or 4000 0000 0000 0002 to see a decline) or instant EFT, and cash out to a bank account. The card and bank are simulated; every rand is a real payment on the test ledger between the platform's bank wallet and the fan's wallet. In production the gateway becomes a South African payment provider and the float is converted to and from rand by a licensed exchange.
- **Your details.** Fans and promoters edit their name and mobile. Promoters edit socials and past events straight away; a new public name, registration number or bank account waits for an admin's approval.

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

Payments settle in RLUSD on Testnet (or XRP on Devnet). Set `SETTLE_ASSET=XRP` (and `VITE_SETTLE_ASSET=XRP` in `web/.env`) to pay in test XRP on Testnet when the RLUSD faucet isn't paying out. The app shows rands only, and the blockchain stays invisible to fans. `npm run bank` shows what the test bank wallet holds.

## Accounts and roles

Sign-up and sign-in use Supabase (email and password). Everyone gets a role:

| Role | Can |
| --- | --- |
| Fan | Every new account. Verify once, buy tickets, add an agent with limits, resell at the promoter's cap, top up test money |
| Promoter | Apply as a registered business or an independent promoter. Once an admin approves, create events and run them: open and close sales, set tickets per fan, the resale cap and the fee, watch the live feed |
| Admin | Review promoter applications (approve, ask for more, don't approve), change anyone's role, and mark promoter payouts paid. Admins can view any event but only its promoter can change it |

Every account gets its own ticket wallet, created and funded by the server on Testnet the first time they sign in. The seed is encrypted with `WALLET_ENCRYPTION_KEY` before it is stored, and fans never see it. Buying directly needs no agent: the server pays from the fan's wallet. The agent is an add-on that the backend starts for one fan and one event, with that wallet only.

Each event is its own ticket issuance on the ledger, created by the platform wallet on behalf of the promoter, so tickets from different events never mix.

## Repo layout

```
supabase/  SQL for accounts, roles, promoter applications, events and wallets
shared/    types, network config and memo format shared by everything
backend/   Express API, promoter wallet, XRPL logic, live event stream (SSE)
agent/     the fan's agent: MCP server with 9 tools, AI runner, Batch signer
web/       React app for fans and promoters
scripts/   setup (wallets, allowances, ticket issuance) and the scripted demo
```

## Set up Supabase (once)

1. In the Supabase SQL editor, run `supabase/migrations/001_accounts_roles_events.sql`.
2. Authentication > Sign In / Providers > Email: turn off "Confirm email" while testing.
3. Run `supabase/migrations/002_profile_phone.sql` too (adds the phone number from sign-up).
4. Sign up in the app, then make yourself an admin in the SQL editor:
   `update public.profiles set role = 'admin' where email = 'you@example.com';`

## Run it

You need Node 20+ and a network that can reach the XRPL Testnet or Devnet.

```bash
npm install
npm run setup     # creates .env, funds the demo wallets, issues tickets
npm run dev       # backend on http://localhost:4000
npm run web       # app on http://localhost:5173
```

Fill in `.env` (backend) and `web/.env` (app) from the two `.env.example` files. The backend needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the secret key) and `WALLET_ENCRYPTION_KEY`. The app needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_API_URL`. Without Supabase the backend still runs the scripted demo from `data.json`.

Add `ANTHROPIC_API_KEY` to `.env` to run the agent with the AI model. Without it, the agent falls back to a simple policy so the demo still works.

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

## SMS

Every alert also goes out as a text. Fans get a text when their tickets arrive (with a link to show at the door), when their resale ticket sells, and when they get a resale ticket. For the MVP these are placeholders: the backend prints each message to its log. An SMS provider plugs into `backend/src/lib/sms.ts`.

## Deploy

- **Backend on Render:** New > Blueprint, pick this repo (it reads `render.yaml`). Fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WALLET_ENCRYPTION_KEY`, `PROMOTER_SEED`, `BANK_SEED` (from your local `.env` after `npm run setup`), `CORS_ORIGIN` (your Vercel URL) and `ANTHROPIC_API_KEY`.
- **App on Vercel:** import the repo with the root directory left as the repo root (it reads `vercel.json`). Add `VITE_API_URL` (your Render URL plus `/api`), `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_XRPL_NETWORK`.

## Test it with real people

1. Sign up as a promoter, fill in the application.
2. As an admin, open Review, Promoters and approve it.
3. As the promoter, create an event. It goes to review.
4. As the admin, open Review, Events and approve the event. As the promoter, open sales.
5. Sign up as a fan, verify, add money in Wallet (test card 4242 4242 4242 4242), add a wish, buy tickets.
6. A second fan adds an agent with limits. A fan who can't go resells, and the other buys it.
7. At the door, the promoter opens Door scanner and scans a fan's ticket from Tickets, Show at the door. Scan it again: Already used.
8. A registered-business promoter sees each event's payout go out automatically in Payouts. A ticket holder cashes out from Wallet. Cancel a test event to see everyone refunded.
9. A promoter or admin can switch to ticket holder mode from the + menu to buy tickets with the same account (never for their own events).

### Preview without a ledger

`VITE_MOCK=1 npm run dev -w web` runs the whole app on simulated data. A bar at the top switches between a fan, a promoter and an admin.

## The demo moments

1. Thandi's agent buys 2 tickets the second sales open. A scalper's agent buys 1.
2. The scalper lists at R1,700. Sipho's agent passes because it's over his limit. A direct sale off the platform fails on the ledger.
3. Thandi can't go and lists at R1,250. Sipho's agent buys it, and the ticket and money swap in one step. A listing above the cap is refused.
4. A scammer's fake ticket and a fan-to-fan send both fail.

## Team

Brian Mbana and Busisiwe Ndlovu.
