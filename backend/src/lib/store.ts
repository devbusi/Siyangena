import fs from "fs";
import path from "path";
import type {
  AgentLogEntry,
  AlertItem,
  BankTransfer,
  CancelProgress,
  ChangeRequest,
  EventReview,
  Payout,
  BatchStatus,
  DropState,
  DropEvent,
  LedgerItem,
  Listing,
  Mandate,
} from "@drop/shared";
import { db, supabaseConfigured } from "./supabase";

// Working state lives in memory. It is saved as a snapshot to Supabase (app_state table)
// when Supabase is configured, otherwise to backend/data.json for local demos.
// Events also get their own rows in the public events table so the app can list them.

export interface DropRecord {
  id: string;
  name: string;
  venue: string;
  city?: string;
  scene?: string;
  posterUrl?: string;
  promoterId?: string;
  promoterName?: string;
  startsAt: string;
  state: DropState;
  priceZar: number;
  supply: number;
  sold: number;
  maxPerFan: number;
  resaleCapZar: number;
  resaleFeePct: number;
  issuanceId: string;
  issuanceTx?: string;
  createdAt?: string;
  cancel?: CancelProgress;
  review?: EventReview;
  category?: string;
}

export interface WishRecord {
  id: string;
  fanId: string;
  query: string;
  city?: string;
  maxZar?: number;
  createdAt: string;
}

export interface CheckinRecord {
  address: string;
  fanId?: string;
  at: string;
}

export interface FanRecord {
  verified: boolean;
  credentialTx?: string;
  authTx?: string;
}

export interface IntentRecord {
  requestId: string;
  eventId: string;
  fanId: string;
  mandateId: string;
  quantity: number;
  amountRlusd: string;
  status: "pending" | "paid" | "fulfilled" | "refunded" | "expired";
  createdAt: string;
  expiresAt: string;
  paymentTx?: string;
  ticketTx?: string;
}

export interface ListingRecord extends Listing {
  eventId: string;
  createdAt: string;
}

export interface BatchRecord {
  batchId: string;
  eventId: string;
  listingId: string;
  sellerFanId: string;
  buyerFanId: string;
  status: BatchStatus;
  batch: Record<string, unknown>;
  // fanId -> signed batch JSON from signMultiBatch
  signatures: Record<string, Record<string, unknown>>;
  createdAt: string;
  expiresAt: string;
  txHash?: string;
}

export interface EventStats {
  revenueRlusd: string;
  resales: number;
  feesRlusd: string;
}

export interface StoreState {
  drops: Record<string, DropRecord>;
  fans: Record<string, FanRecord>;
  mandates: Record<string, Mandate>; // keyed by `${fanId}:${eventId}`
  intents: Record<string, IntentRecord>;
  listings: Record<string, ListingRecord>;
  batches: Record<string, BatchRecord>;
  history: Record<string, LedgerItem[]>; // keyed by fanId
  stats: Record<string, EventStats>; // keyed by eventId
  agentLog: AgentLogEntry[];
  events: DropEvent[];
  processedTx: string[];
  wishes: Record<string, WishRecord>;
  alerts: Record<string, AlertItem[]>; // keyed by fanId, newest last
  checkins: Record<string, CheckinRecord[]>; // keyed by eventId
  turnedAway: Record<string, number>; // keyed by eventId
  payouts: Record<string, Payout>;
  changeRequests: Record<string, ChangeRequest>; // keyed by userId
  transfers: Record<string, BankTransfer & { userId: string }>;
}

const DATA_FILE = process.env.DROP_DATA_FILE || path.resolve(__dirname, "../../data.json");
const STATE_ROW = process.env.APP_STATE_ID || "main";

function emptyState(): StoreState {
  return {
    drops: {},
    fans: {},
    mandates: {},
    intents: {},
    listings: {},
    batches: {},
    history: {},
    stats: {},
    agentLog: [],
    events: [],
    processedTx: [],
    wishes: {},
    alerts: {},
    checkins: {},
    turnedAway: {},
    payouts: {},
    changeRequests: {},
    transfers: {},
  };
}

// Older snapshots held a single `drop`, fan-keyed mandates and one stats object.
function migrate(parsed: any): StoreState {
  const next = { ...emptyState(), ...parsed } as StoreState & { drop?: DropRecord };
  if (parsed.drop && !parsed.drops) {
    const drop = parsed.drop as DropRecord;
    next.drops = { [drop.id]: drop };
    if (parsed.stats && "revenueRlusd" in parsed.stats) next.stats = { [drop.id]: parsed.stats };
    const mandates: Record<string, Mandate> = {};
    for (const [fanId, m] of Object.entries(parsed.mandates ?? {})) {
      const mandate = m as Mandate;
      mandates[`${fanId}:${drop.id}`] = { ...mandate, eventId: drop.id };
    }
    next.mandates = mandates;
    for (const i of Object.values(next.intents)) (i as IntentRecord).eventId ??= drop.id;
    for (const l of Object.values(next.listings)) (l as ListingRecord).eventId ??= drop.id;
    for (const b of Object.values(next.batches)) (b as BatchRecord).eventId ??= drop.id;
  }
  delete (next as any).drop;
  // A promoter Sequence lock does not survive a restart, so in-flight Batches are dead.
  for (const b of Object.values(next.batches)) {
    if (b.status === "awaiting_signatures") b.status = "expired";
  }
  for (const l of Object.values(next.listings)) {
    if (l.status === "signing") l.status = "open";
  }
  return next;
}

function loadFile(): StoreState {
  try {
    if (fs.existsSync(DATA_FILE)) return migrate(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
  } catch (error) {
    console.error("Could not read data.json, starting fresh:", error);
  }
  return emptyState();
}

export const state: StoreState = supabaseConfigured() ? emptyState() : loadFile();

// ---- Events table mirror ----

export function eventRow(d: DropRecord) {
  return {
    id: d.id,
    promoter_id: d.promoterId ?? null,
    promoter_name: d.promoterName ?? null,
    name: d.name,
    venue: d.venue,
    city: d.city ?? null,
    scene: d.scene ?? null,
    poster_url: d.posterUrl ?? null,
    starts_at: d.startsAt,
    price_zar: d.priceZar,
    supply: d.supply,
    sold: d.sold,
    max_per_fan: d.maxPerFan,
    resale_cap_zar: d.resaleCapZar,
    resale_fee_pct: d.resaleFeePct,
    state: d.state,
    issuance_id: d.issuanceId,
    issuance_tx: d.issuanceTx ?? null,
    updated_at: new Date().toISOString(),
  };
}

function fromRow(r: any): DropRecord {
  return {
    id: r.id,
    promoterId: r.promoter_id ?? undefined,
    promoterName: r.promoter_name ?? undefined,
    name: r.name,
    venue: r.venue,
    city: r.city ?? undefined,
    scene: r.scene ?? undefined,
    posterUrl: r.poster_url ?? undefined,
    startsAt: r.starts_at,
    state: r.state,
    priceZar: Number(r.price_zar),
    supply: Number(r.supply),
    sold: Number(r.sold),
    maxPerFan: Number(r.max_per_fan),
    resaleCapZar: Number(r.resale_cap_zar),
    resaleFeePct: Number(r.resale_fee_pct),
    issuanceId: r.issuance_id ?? "",
    issuanceTx: r.issuance_tx ?? undefined,
    createdAt: r.created_at,
  };
}

const dirtyDrops = new Set<string>();

// Mark an event changed so its row in the events table is updated on the next save.
export function touchDrop(id: string) {
  dirtyDrops.add(id);
  save();
}

// Load the snapshot and the events table at boot. Safe to call when Supabase is off.
export async function initStore() {
  if (!supabaseConfigured()) return;
  const snap = await db().from("app_state").select("data").eq("id", STATE_ROW).maybeSingle();
  if (snap.error) throw new Error(`Could not load app_state: ${snap.error.message}`);
  Object.assign(state, snap.data?.data ? migrate(snap.data.data) : emptyState());

  const rows = await db().from("events").select("*");
  if (rows.error) throw new Error(`Could not load events: ${rows.error.message}`);
  for (const r of rows.data ?? []) {
    const fromTable = fromRow(r);
    // The snapshot wins on live counters if it is ahead of the table.
    const snapDrop = state.drops[fromTable.id];
    const merged = snapDrop && snapDrop.sold > fromTable.sold ? { ...fromTable, sold: snapDrop.sold, state: snapDrop.state } : fromTable;
    state.drops[fromTable.id] = {
      ...merged,
      ...(snapDrop?.cancel ? { cancel: snapDrop.cancel } : {}),
      ...(snapDrop?.review ? { review: snapDrop.review } : {}),
      ...(snapDrop?.category ? { category: snapDrop.category } : {}),
    };
  }
  console.log(`Loaded ${Object.keys(state.drops).length} event(s) from Supabase`);
}

let saveTimer: NodeJS.Timeout | null = null;
let saving = Promise.resolve();

// Debounced write so bursts of updates cost one write.
export function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    state.events = state.events.slice(-300);
    state.agentLog = state.agentLog.slice(-500);
    state.processedTx = state.processedTx.slice(-2000);
    for (const k of Object.keys(state.alerts)) state.alerts[k] = state.alerts[k].slice(-100);

    if (!supabaseConfigured()) {
      fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), (error) => {
        if (error) console.error("Failed to write data.json:", error);
      });
      return;
    }

    const drops = [...dirtyDrops].map((id) => state.drops[id]).filter(Boolean);
    dirtyDrops.clear();
    const snapshot = JSON.parse(JSON.stringify(state));
    saving = saving.then(async () => {
      const a = await db().from("app_state").upsert({ id: STATE_ROW, data: snapshot, updated_at: new Date().toISOString() });
      if (a.error) console.error("Failed to save app_state:", a.error.message);
      if (drops.length) {
        const b = await db().from("events").upsert(drops.map(eventRow));
        if (b.error) console.error("Failed to save events:", b.error.message);
      }
    });
  }, 300);
}

export function resetState() {
  Object.assign(state, emptyState());
  save();
}
