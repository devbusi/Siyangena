import fs from "fs";
import path from "path";
import type {
  AgentLogEntry,
  BatchStatus,
  DropState,
  DropEvent,
  LedgerItem,
  Listing,
  Mandate,
} from "@drop/shared";

// In-memory state, persisted to backend/data.json (gitignored).
// This stands in for CropMarket's Postgres/Drizzle layer: enough for a hackathon demo.

export interface DropRecord {
  id: string;
  name: string;
  venue: string;
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
}

export interface FanRecord {
  verified: boolean;
  credentialTx?: string;
  authTx?: string;
}

export interface IntentRecord {
  requestId: string;
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
  createdAt: string;
}

export interface BatchRecord {
  batchId: string;
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

export interface StoreState {
  drop: DropRecord | null;
  fans: Record<string, FanRecord>;
  mandates: Record<string, Mandate>; // keyed by fanId
  intents: Record<string, IntentRecord>;
  listings: Record<string, ListingRecord>;
  batches: Record<string, BatchRecord>;
  history: Record<string, LedgerItem[]>; // keyed by fanId
  stats: { revenueRlusd: string; resales: number; feesRlusd: string };
  agentLog: AgentLogEntry[];
  events: DropEvent[];
  processedTx: string[];
}

const DATA_FILE = process.env.DROP_DATA_FILE || path.resolve(__dirname, "../../data.json");

function emptyState(): StoreState {
  return {
    drop: null,
    fans: {},
    mandates: {},
    intents: {},
    listings: {},
    batches: {},
    history: {},
    stats: { revenueRlusd: "0", resales: 0, feesRlusd: "0" },
    agentLog: [],
    events: [],
    processedTx: [],
  };
}

function load(): StoreState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      const state = { ...emptyState(), ...parsed } as StoreState;
      // A promoter Sequence lock does not survive a restart, so in-flight Batches are dead.
      for (const b of Object.values(state.batches)) {
        if (b.status === "awaiting_signatures") b.status = "expired";
      }
      for (const l of Object.values(state.listings)) {
        if (l.status === "signing") l.status = "open";
      }
      return state;
    }
  } catch (error) {
    console.error("Could not read data.json, starting fresh:", error);
  }
  return emptyState();
}

export const state: StoreState = load();

let saveTimer: NodeJS.Timeout | null = null;

// Debounced write so bursts of updates cost one disk write.
export function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    // Keep the file small.
    state.events = state.events.slice(-200);
    state.agentLog = state.agentLog.slice(-500);
    state.processedTx = state.processedTx.slice(-1000);
    fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), (error) => {
      if (error) console.error("Failed to write data.json:", error);
    });
  }, 200);
}

export function resetState() {
  Object.assign(state, emptyState());
  save();
}
