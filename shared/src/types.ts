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
}

export interface CreateDropRequest {
  name: string;
  venue: string;
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
