// Test accounts, one per role, and a full run of the main flow against the running backend.
//
//   npm run test-accounts          creates (or resets) the three accounts
//   npm run test-flow              creates them, then runs the whole flow end to end
//   npm run test-clean             deletes every other account, all events and the saved app
//                                  state, then creates the three accounts fresh. Stop the
//                                  backend first, and start it again after.
//
// Accounts (same test password for all three):
//   testuser@siyangena.test       ticket holder
//   testpromoter@siyangena.test   promoter, approved, registered business (paid as tickets sell)
//   testadmin@siyangena.test      admin
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env, and for the flow the backend
// running (npm run dev). Test-only: never use these on a real deployment.
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

export const TEST_PASSWORD = "Siyangena-Test-2026";
const API = (process.env.TEST_API_URL || "http://localhost:4000/api").replace(/\/$/, "");
const EXPLORER = (process.env.XRPL_NETWORK || "testnet") === "devnet" ? "https://devnet.xrpl.org" : "https://testnet.xrpl.org";

const PEOPLE = [
  { key: "user", email: "testuser@siyangena.test", fullName: "Test User", role: "fan", phone: "+27820000001" },
  { key: "promoter", email: "testpromoter@siyangena.test", fullName: "Test Promoter", role: "promoter", phone: "+27820000002" },
  { key: "admin", email: "testadmin@siyangena.test", fullName: "Test Admin", role: "admin", phone: "+27820000003" },
] as const;
type Key = (typeof PEOPLE)[number]["key"];

function admin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const ok = (msg: string) => console.log(`  ok    ${msg}`);
const step = (msg: string) => console.log(`\n${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensureAccounts(): Promise<Record<Key, string>> {
  const db = admin();
  const ids = {} as Record<Key, string>;
  const { data: list, error: listError } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw new Error(`Couldn't list users: ${listError.message}`);
  for (const p of PEOPLE) {
    const found = list.users.find((u) => u.email?.toLowerCase() === p.email);
    const meta = { full_name: p.fullName, phone: p.phone, role: p.role === "admin" ? "fan" : p.role };
    if (found) {
      const { error } = await db.auth.admin.updateUserById(found.id, { password: TEST_PASSWORD, email_confirm: true, user_metadata: meta });
      if (error) throw new Error(`Couldn't reset ${p.email}: ${error.message}`);
      ids[p.key] = found.id;
      ok(`${p.email} already there, password reset`);
    } else {
      const { data, error } = await db.auth.admin.createUser({ email: p.email, password: TEST_PASSWORD, email_confirm: true, user_metadata: meta });
      if (error || !data.user) throw new Error(`Couldn't create ${p.email}: ${error?.message}`);
      ids[p.key] = data.user.id;
      ok(`${p.email} created`);
    }
    // The sign-up trigger makes the profile; make sure it exists and has the right role and details.
    const { error: profileError } = await db
      .from("profiles")
      .upsert({ id: ids[p.key], email: p.email, full_name: p.fullName, phone: p.phone, role: p.role }, { onConflict: "id" });
    if (profileError) throw new Error(`Couldn't set up the profile for ${p.email}: ${profileError.message}`);
  }
  // The promoter is approved straight away, as a registered business so payouts go out as tickets sell.
  const { error: appError } = await db.from("promoter_applications").upsert(
    {
      user_id: ids.promoter,
      kind: "business",
      display_name: "Test Promoter Co",
      registration_number: "2020/000000/07",
      past_events: "Test events only",
      socials: "@siyangena_test",
      payout_details: "FNB, 62000000001",
      status: "approved",
      review_note: null,
      reviewed_by: ids.admin,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (appError) throw new Error(`Couldn't approve the test promoter: ${appError.message}`);
  ok("Test Promoter Co approved as a registered business");
  return ids;
}

async function signIn(email: string): Promise<string> {
  const c = admin();
  const { data, error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`Couldn't sign in ${email}: ${error?.message}`);
  return data.session.access_token;
}

async function call<T = any>(token: string, method: string, p: string, body?: unknown): Promise<T> {
  const res = await fetch(API + p, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!json.success) throw new Error(`${method} ${p} failed: ${json.message ?? res.statusText}`);
  return json.data as T;
}

const tx = (hash?: string) => (hash ? `${EXPLORER}/transactions/${hash}` : "");

async function flow() {
  step("0. Backend");
  const health = await fetch(API.replace(/\/api$/, "/")).then((r) => r.json()).catch(() => null);
  if (!health?.success) throw new Error(`The backend isn't answering at ${API}. Start it with npm run dev.`);
  ok(`backend up at ${API}`);

  step("1. Sign in and set up wallets (the first time takes a few seconds each)");
  const t = {} as Record<Key, string>;
  for (const p of PEOPLE) {
    t[p.key] = await signIn(p.email);
    const me = await call(t[p.key], "POST", "/me/setup", {});
    ok(`${p.email}: ${me.role}, wallet ${me.walletAddress ?? "ready"}`);
  }

  step("2. Promoter creates an event (it goes to review)");
  const startsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const event = await call(t.promoter, "POST", "/promoter/events", {
    name: `Siyangena Test Night ${new Date().toISOString().slice(11, 16)}`,
    category: "Music",
    venue: "The Test Venue, 1 Long Street",
    city: "Cape Town",
    scene: "longstreet",
    startsAt,
    priceZar: 150,
    supply: 20,
    maxPerFan: 4,
    resaleCapZar: 200,
    resaleFeePct: 5,
  });
  ok(`created ${event.name} (${event.id}), review: ${event.review?.status ?? "none"}`);
  ok(`ticket issuance on the ledger: ${tx(event.issuanceTx)}`);

  step("3. Admin approves it, promoter opens sales");
  await call(t.admin, "POST", `/admin/events/${event.id}/review`, { decision: "approved" });
  ok("approved");
  await call(t.promoter, "POST", `/promoter/events/${event.id}/open`, {});
  ok("sales open");

  step("4. Ticket holder: wish, verify, add money, buy");
  const wish = await call(t.user, "POST", "/me/wishes", { query: "Siyangena Test Night", city: "Cape Town", maxZar: 500 });
  ok(`wish saved, ${wish.matches} event(s) fit already`);
  await call(t.user, "POST", "/me/verify", {});
  ok("verified (credential on the ledger)");
  const dep = await call(t.user, "POST", "/me/deposits", { amountZar: 1000, method: "card", cardNumber: "4242 4242 4242 4242" });
  ok(`added R${dep.amountZar} by ${dep.method}, ref ${dep.reference}: ${dep.explorerUrl ?? ""}`);
  const buy = await call(t.user, "POST", `/me/events/${event.id}/buy`, { quantity: 2 });
  ok(`paid for 2 tickets: ${tx(buy.paymentTx)}`);
  let status: any = null;
  for (let i = 0; i < 30; i++) {
    status = await call(t.user, "GET", `/me/purchases/${buy.requestId}`);
    if (status?.status === "fulfilled" || status?.status === "refunded") break;
    await sleep(2000);
  }
  if (status?.status !== "fulfilled") throw new Error(`Tickets didn't arrive (status: ${status?.status ?? "unknown"})`);
  ok(`2 tickets in the wallet: ${tx(status.ticketTx)}`);

  step("5. Door: scan the ticket, then scan it again");
  const pass = await call(t.user, "GET", `/me/events/${event.id}/pass`);
  const first = await call(t.promoter, "POST", `/promoter/events/${event.id}/checkin`, { code: pass.code });
  ok(`first scan: ${first.message} (${first.fanName}, ticket ${first.ticket} of ${first.of})`);
  const second = await call(t.promoter, "POST", `/promoter/events/${event.id}/checkin`, { code: pass.short });
  ok(`short code ${pass.short}: ${second.message}${second.ticket ? ` (ticket ${second.ticket} of ${second.of})` : ""}`);
  const third = await call(t.promoter, "POST", `/promoter/events/${event.id}/checkin`, { code: pass.code });
  ok(`third scan: ${third.ok ? third.message : `turned away, ${third.message}`}`);

  step("6. Ticket holder cashes out");
  const out = await call(t.user, "POST", "/me/cashouts", { amountZar: 200, bank: "FNB", accountNumber: "62000000002" });
  ok(`cash out R${out.amountZar} to ${out.method}, ref ${out.reference}: ${out.explorerUrl ?? ""}`);

  step("7. Promoter payout goes out automatically (checked every minute)");
  let paid: any = null;
  for (let i = 0; i < 18; i++) {
    const s = await call(t.promoter, "GET", "/promoter/payouts");
    paid = s.history.find((p: any) => p.eventId === event.id && p.status === "paid");
    if (paid) break;
    await sleep(5000);
  }
  if (paid) ok(`paid R${paid.amountZar} to ${paid.bank}, ref ${paid.reference}: ${paid.explorerUrl ?? ""}`);
  else console.log("  wait  no payout yet: it runs every minute, check Payouts in the app shortly");

  step("8. Alerts the ticket holder got");
  const alerts = await call<any[]>(t.user, "GET", "/me/alerts");
  for (const a of alerts.slice(0, 5)) ok(`${a.title}`);

  console.log(`\nAll done. Sign in to the app with any of the three accounts, password ${TEST_PASSWORD}.`);
}

// A clean slate: everyone except the test accounts, every event, and the saved app state.
async function clean() {
  const db = admin();
  const keep = new Set<string>(PEOPLE.map((p) => p.email));
  const { data: list, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Couldn't list users: ${error.message}`);
  const gone = list.users.filter((u) => !keep.has((u.email ?? "").toLowerCase()));
  step(`Cleaning: ${gone.length} account(s), all events, saved app state`);
  if (gone.length) {
    const ids = gone.map((u) => u.id);
    const { error: e1 } = await db.from("promoter_applications").update({ reviewed_by: null }).in("reviewed_by", ids);
    if (e1) throw new Error(`Couldn't clear reviewers: ${e1.message}`);
  }
  for (const u of gone) {
    const { error: e } = await db.auth.admin.deleteUser(u.id);
    if (e) throw new Error(`Couldn't delete ${u.email}: ${e.message}`);
    ok(`deleted ${u.email}`);
  }
  const { error: e2 } = await db.from("events").delete().neq("id", "");
  if (e2) throw new Error(`Couldn't clear events: ${e2.message}`);
  ok("events cleared");
  const { error: e3 } = await db.from("app_state").delete().neq("id", "");
  if (e3) throw new Error(`Couldn't clear app state: ${e3.message}`);
  ok("app state cleared (wishes, alerts, payouts, history start fresh)");
}

async function main() {
  if (process.argv.includes("--clean")) {
    if (!process.argv.includes("--yes")) {
      console.log("This deletes every account except the three test ones, every event and all saved app data.");
      console.log("Stop the backend first. Then run: npm run test-clean -- --yes");
      return;
    }
    await clean();
  }
  step("Test accounts");
  await ensureAccounts();
  console.log(`\n  Password for all three: ${TEST_PASSWORD}`);
  if (process.argv.includes("--flow")) await flow();
}

main().catch((e) => {
  console.error(`\nStopped: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
