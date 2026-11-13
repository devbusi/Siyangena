// API contract from docs/PLAN.md section 6.
// Money fields are strings. `zar` is display, `rlusd` is what settles
// (on Devnet the settle asset is XRP, but the field names stay the same).
//
// Every response uses the CropMarket envelope:
//   success: { success: true, data: T }
//   failure: { success: false, code, message, errors? }

// ---- Envelope ----

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export type ErrorCode =
  | "MANDATE_EXCEEDED"
  | "LIMIT_PER_FAN"
  | "NOT_VERIFIED"
  | "SOLD_OUT"
  | "NOT_OPEN"
  | "CAP_EXCEEDED"
  | "NO_TICKET"
  | "NO_MANDATE"
  | "NO_DROP"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "INVALID_SIGNATURE"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "LEDGER_ERROR"
  | "DECLINED"
  | "IN_REVIEW"
  | "INTERNAL_ERROR";

export interface ApiFailure {
  success: false;
  code: ErrorCode;
  message: string;
  errors?: { path: string; message: string }[];
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// Anything that touched the ledger.
export interface LedgerRef {
  txHash: string;
  explorerUrl: string;
}

// ---- Drop ----

export type DropState = "scheduled" | "open" | "sold_out" | "closed" | "cancelled";

export interface Drop {
  id: string;
  name: string;
  venue: string;
  startsAt: string;
  state: DropState;
  priceZar: string;
  priceRlusd: string;
  supply: number;
  sold: number;
  maxPerFan: number;
  resaleCapZar: string;
  resaleFeePct: number;
  issuanceId: string;
  issuanceTx?: string;
  city?: string;
  scene?: string;
  posterUrl?: string;
  promoterId?: string;
  promoterName?: string;
  category?: EventCategory;
  // Set when the promoter cancels: what fans are told, and how the refunds are going.
  cancel?: CancelProgress;
  // Every new event is checked by an admin before it can go on sale.
  review?: EventReview;
}

export interface EventReview {
  status: "pending" | "approved" | "needs_more";
  note?: string;
  submittedAt: string;
  reviewedAt?: string;
}

export const EVENT_CATEGORIES = ["Music", "Nightlife", "Sport", "Food and drink", "Comedy", "Arts and culture", "Festivals", "Family"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export interface CancelProgress {
  reason: string;
  at: string;
  holders: number;
  refunded: number;
  totalZar: string;
  refundedZar: string;
  done: boolean;
}

export interface CreateDropRequest {
  name: string;
  venue: string;
  category?: EventCategory;
  city?: string;
  scene?: string;
  posterUrl?: string;
  startsAt: string;
  priceZar: number;
  supply: number;
  maxPerFan: number;
  resaleCapZar: number;
  resaleFeePct: number;
}

export interface UpdateDropRequest {
  resaleCapZar?: number;
  resaleFeePct?: number;
  maxPerFan?: number;
}

export interface PromoterStats {
  sold: number;
  revenueRlusd: string;
  resales: number;
  feesRlusd: string;
}

// ---- Fans ----

export interface Fan {
  id: string;
  name: string;
  address: string;
  agentAddress: string;
  verified: boolean;
  credentialTx?: string;
  authTx?: string;
}

export interface FanWallet {
  allowanceRlusd: string;
  allowanceZar: string;
  xrp: string;
  tickets: number;
}

export type LedgerItemKind =
  | "primary_purchase"
  | "ticket_received"
  | "refund"
  | "resale_sold"
  | "resale_bought";

export interface LedgerItem {
  kind: LedgerItemKind;
  at: string;
  description: string;
  tickets: number; // +n received, -n sent
  amountRlusd?: string;
  txHash?: string;
  explorerUrl?: string;
  eventId?: string;
}

export interface FanTickets {
  count: number;
  history: LedgerItem[];
  // Tickets held per event, for accounts that hold more than one event.
  events?: { eventId: string; name: string; venue: string; startsAt: string; count: number }[];
}

// ---- Mandates (human only; the agent can read, never write) ----

export type MandateStatus = "active" | "filled" | "cancelled";

export interface Mandate {
  id: string;
  fanId: string;
  eventId?: string;
  quantity: number;
  ceilingZar: string;
  bought: number;
  status: MandateStatus;
}

// One agent per event: its limits, whether it's running, and the event it's for.
export interface MyAgent {
  eventId: string;
  eventName: string;
  venue: string;
  startsAt: string;
  eventState: DropState;
  mandate: Mandate;
  running: boolean;
}

export interface PutMandateRequest {
  quantity: number;
  ceilingZar: number;
}

// ---- Primary sale ----

export interface SaleIntentRequest {
  fanId: string;
  quantity: number;
  eventId?: string;
}

// What the agent puts in MemoData (JSON, hex-encoded) with MemoType "drop".
export interface DropMemo {
  kind: "sale" | "refund" | "ticket" | "resale";
  requestId?: string;
  mandateId?: string;
  listingId?: string;
  reason?: string;
}

export interface SaleIntent {
  requestId: string;
  payTo: string;
  amountRlusd: string;
  memo: DropMemo;
  expiresAt: string;
}

// ---- Resale ----

export type ListingStatus = "open" | "signing" | "settled" | "refused";

export interface Listing {
  id: string;
  eventId?: string;
  sellerFanId: string;
  priceZar: string;
  feeZar: string;
  totalZar: string;
  status: ListingStatus;
  buyerFanId?: string;
  batchId?: string;
  txHash?: string;
  explorerUrl?: string;
}

export interface CreateListingRequest {
  fanId: string;
  priceZar: number;
  eventId?: string;
}

export interface AcceptListingRequest {
  buyerFanId: string;
}

export interface AcceptListingResponse {
  batchId: string;
  // Autofilled Batch transaction JSON. Seller and buyer each sign it with
  // signMultiBatch and post it back. Only BatchSigners may differ.
  batch: Record<string, unknown>;
}

export interface SubmitSignatureRequest {
  fanId: string;
  // Batch JSON returned by signMultiBatch, or its encoded blob.
  signedBatch: Record<string, unknown> | string;
}

export type BatchStatus = "awaiting_signatures" | "submitted" | "settled" | "failed" | "expired" | "refused";

export interface InnerResult {
  index: number;
  description: string;
  hash: string;
  result: string;
  explorerUrl: string;
}

export interface SubmitSignatureResponse {
  status: BatchStatus;
  waitingFor?: string[];
  txHash?: string;
  explorerUrl?: string;
  innerResults?: InnerResult[];
}

export interface ResaleBatchView {
  batchId: string;
  listingId: string;
  sellerFanId: string;
  buyerFanId: string;
  status: BatchStatus;
  batch: Record<string, unknown>;
  signedBy: string[];
  expiresAt: string;
}

// ---- Agent log ----

export interface AgentLogRequest {
  fanId: string;
  mandateId: string;
  tool: string;
  reason: string;
  txHash?: string;
}

export interface AgentLogEntry extends AgentLogRequest {
  id: string;
  at: string;
  explorerUrl?: string;
}

// ---- Events (GET /api/events, SSE) ----

export type DropEventType =
  | "drop.opened"
  | "drop.sold_out"
  | "drop.cancelled"
  | "sale.intent"
  | "sale.paid"
  | "sale.ticket_sent"
  | "sale.refunded"
  | "agent.action"
  | "mandate.blocked"
  | "resale.listed"
  | "resale.sign_requested"
  | "resale.settled"
  | "resale.refused"
  | "ledger.rejected";

export interface DropEvent {
  type: DropEventType;
  at: string;
  fanId?: string;
  eventId?: string;
  listingId?: string;
  batchId?: string;
  message: string;
  // Plain-English detail for the app (e.g. the agent's own reason). Optional.
  detail?: string;
  tool?: string;
  txHash?: string;
  explorerUrl?: string;
}


// ---- Accounts and roles ----

export type Role = "fan" | "promoter" | "admin";
export type ApplicationStatus = "pending" | "approved" | "needs_more" | "rejected";

export interface PromoterApplication {
  userId: string;
  kind: "business" | "independent";
  displayName: string;
  registrationNumber?: string;
  pastEvents?: string;
  socials?: string;
  payoutDetails?: string;
  status: ApplicationStatus;
  reviewNote?: string;
  reviewedAt?: string;
  createdAt?: string;
  email?: string;
}

export interface Me {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: Role;
  verified: boolean;
  walletReady: boolean;
  walletAddress?: string;
  application?: PromoterApplication;
  changeRequest?: ChangeRequest;
}

// A promoter asking to change details an admin checked: their public name,
// registration number or bank account. Nothing changes until an admin approves.
export interface ChangeRequest {
  userId: string;
  displayName?: string;
  registrationNumber?: string;
  payoutDetails?: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  createdAt: string;
  reviewedAt?: string;
  email?: string;
  current?: { displayName?: string; registrationNumber?: string; payoutDetails?: string };
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: Role;
  verified: boolean;
  createdAt: string;
}


// ---- Wishlist, alerts, door, payouts ----

export interface Wish {
  id: string;
  query: string;
  city?: string;
  maxZar?: string;
  createdAt: string;
  matches: number; // events on Siyangena that match right now
  events: WishMatch[];
}

export interface WishMatch {
  id: string;
  name: string;
  venue: string;
  city?: string;
  startsAt: string;
  priceZar: string;
  state: DropState;
}

export type AlertKind = "new_event" | "sale_open" | "resale" | "tickets" | "sold" | "limit" | "cancelled";

export interface AlertItem {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  eventId?: string;
  at: string;
  read: boolean;
}

// What fans on Siyangena are asking for, for promoters planning an event.
export interface Demand {
  matching: number; // fans whose wish matches the event being planned
  top: { query: string; city?: string; fans: number }[];
}

export interface CheckinResult {
  ok: boolean;
  reason?: "used" | "no_ticket" | "wrong_event" | "expired" | "cancelled" | "bad_code";
  message: string;
  fanName?: string;
  ticket?: number; // which of their tickets this was
  of?: number;
  at?: string;
}

export interface DoorStats {
  checkedIn: number;
  sold: number;
  turnedAway: number;
}

export interface TicketPass {
  code: string;
  short: string; // the same pass as a code staff can type, e.g. K7Q4-M2PX
  expiresAt: string;
  held: number; // tickets this wallet holds for the event
  used: number; // how many of them have already been scanned in
  lastUsedAt?: string;
}

export type PayoutStatus = "requested" | "paid";

export interface Payout {
  id: string;
  promoterId: string;
  promoterName?: string;
  eventId: string;
  eventName: string;
  amountZar: string;
  status: PayoutStatus;
  bank?: string;
  createdAt: string;
  paidAt?: string;
  reference?: string; // the (simulated) bank transfer reference
  txHash?: string; // the ledger move from the platform wallet to the bank wallet
  explorerUrl?: string;
}

// Money in and out of Siyangena through the test payment gateway. Every one is also a
// real payment on the ledger: bank wallet to the fan's wallet, or back.
export interface BankTransfer {
  id: string;
  kind: "deposit" | "cashout";
  amountZar: string;
  method: string; // "Visa ending 4242", "Instant EFT, FNB", "FNB, account ending 4417"
  status: "processing" | "completed" | "failed";
  reference: string;
  createdAt: string;
  completedAt?: string;
  txHash?: string;
  explorerUrl?: string;
  failure?: string;
}

export interface PayoutEventLine {
  eventId: string;
  name: string;
  startsAt: string;
  state: DropState;
  salesZar: string;
  feesZar: string;
  refundedZar: string;
  held: boolean; // independent promoters are paid the morning after the event
  netZar: string;
  platformFeeZar: string; // Siyangena's commission on this event
  requestedZar: string;
  paidZar: string;
  availableZar: string;
}

export interface PayoutSummary {
  earnedZar: string; // ticket sales + resale fees - refunds
  platformFeePct: number;
  platformFeeZar: string; // Siyangena's commission, taken before payout
  feesZar: string;
  resales: number;
  heldZar: string;
  paidZar: string;
  requestedZar: string;
  availableZar: string;
  refundedZar: string;
  kind: "business" | "independent";
  bank?: string;
  nextPayoutAt?: string; // when held money is next paid out (independent promoters)
  events: PayoutEventLine[];
  history: Payout[];
}

// What Siyangena itself has earned: its commission on every promoter's events.
export interface PlatformRevenue {
  feePct: number;
  feesZar: string; // commission on ticket sales and resale fees
  ticketSalesZar: string;
  resaleFeesZar: string;
  paidOutZar: string;
}
