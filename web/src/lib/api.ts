import type {
  AdminUser,
  AlertItem,
  BankTransfer,
  ChangeRequest,
  CheckinResult,
  Demand,
  DoorStats,
  Payout,
  PayoutSummary,
  TicketPass,
  Wish,
  ApplicationStatus,
  CreateDropRequest,
  Drop,
  DropEvent,
  FanTickets,
  FanWallet,
  Listing,
  Mandate,
  MyAgent,
  Me,
  PromoterApplication,
  PromoterStats,
  PutMandateRequest,
  Role,
  SubmitSignatureResponse,
  UpdateDropRequest,
} from "@drop/shared";
import { API_URL, MOCK } from "./config";
import { accessToken } from "./supabase";
import { mockApi } from "./mock";

export type AgentGoal = "buy" | "resale" | "sell";

export interface ApplicationInput {
  kind: "business" | "independent";
  displayName: string;
  registrationNumber?: string;
  pastEvents?: string;
  socials?: string;
  payoutDetails: string;
}

export interface Api {
  // Public
  listEvents(): Promise<Drop[]>;
  getEvent(id: string): Promise<Drop>;
  listings(eventId: string): Promise<Listing[]>;
  subscribe(onEvent: (event: DropEvent) => void): () => void;
  // Signed in
  me(): Promise<Me>;
  setup(): Promise<Me>;
  verify(): Promise<Me>;
  wallet(eventId?: string): Promise<FanWallet>;
  topUp(amountZar: number): Promise<FanWallet>;
  tickets(eventId?: string): Promise<FanTickets>;
  apply(input: ApplicationInput): Promise<PromoterApplication>;
  myAgents(): Promise<MyAgent[]>;
  getMandate(eventId: string): Promise<Mandate | null>;
  putMandate(eventId: string, body: PutMandateRequest): Promise<Mandate>;
  buy(eventId: string, quantity: number): Promise<{ requestId: string }>;
  purchase(requestId: string): Promise<{ status: string } | null>;
  runAgent(eventId: string, goal: AgentGoal, priceZar?: number): Promise<void>;
  resell(eventId: string, priceZar: number): Promise<Listing>;
  buyListing(listingId: string): Promise<SubmitSignatureResponse>;
  wishes(): Promise<Wish[]>;
  addWish(body: { query: string; city?: string; maxZar?: number }): Promise<Wish>;
  removeWish(id: string): Promise<void>;
  alerts(): Promise<AlertItem[]>;
  readAlerts(): Promise<void>;
  ticketPass(eventId: string): Promise<TicketPass>;
  updateProfile(body: { fullName?: string; phone?: string }): Promise<Me>;
  updatePromoterDetails(body: PromoterDetailsInput): Promise<Me>;
  transfers(): Promise<BankTransfer[]>;
  deposit(body: { amountZar: number; method: "card" | "eft"; cardNumber?: string; bank?: string }): Promise<BankTransfer>;
  cashOut(body: { amountZar: number; bank: string; accountNumber: string }): Promise<BankTransfer>;
  // Promoter
  resubmitEvent(eventId: string): Promise<Drop>;
  editEvent(eventId: string, body: EditEventInput): Promise<Drop>;
  myEvents(): Promise<Drop[]>;
  createEvent(body: CreateDropRequest): Promise<Drop>;
  openSales(eventId: string): Promise<Drop>;
  closeSales(eventId: string): Promise<Drop>;
  updateEvent(eventId: string, body: UpdateDropRequest): Promise<Drop>;
  stats(eventId: string): Promise<PromoterStats>;
  demand(plan: { name?: string; city?: string; scene?: string; priceZar?: number }): Promise<Demand>;
  cancelPreview(eventId: string): Promise<CancelPreview>;
  cancelEvent(eventId: string, reason: string): Promise<Drop>;
  checkIn(eventId: string, code: string): Promise<CheckinResult>;
  doorStats(eventId: string): Promise<DoorStats>;
  payouts(): Promise<PayoutSummary>;
  requestPayout(eventId: string): Promise<Payout>;
  // Admin
  applications(status?: ApplicationStatus): Promise<PromoterApplication[]>;
  review(userId: string, decision: ApplicationStatus, note?: string): Promise<PromoterApplication>;
  users(): Promise<AdminUser[]>;
  setRole(userId: string, role: Role): Promise<void>;
  allPayouts(): Promise<Payout[]>;
  eventsInReview(): Promise<Drop[]>;
  reviewEvent(eventId: string, decision: "approved" | "needs_more", note?: string): Promise<Drop>;
  changeRequests(): Promise<ChangeRequest[]>;
  reviewChange(userId: string, decision: "approved" | "rejected", note?: string): Promise<ChangeRequest>;
  markPayoutPaid(id: string): Promise<Payout>;
}

export interface EditEventInput {
  name?: string;
  category?: string;
  venue?: string;
  city?: string;
  startsAt?: string;
  priceZar?: number;
  maxPerFan?: number;
  resaleCapZar?: number;
  resaleFeePct?: number;
  posterUrl?: string;
  resubmit?: boolean;
}

export interface PromoterDetailsInput {
  displayName?: string;
  registrationNumber?: string;
  payoutDetails?: string;
  socials?: string;
  pastEvents?: string;
}

export interface CancelPreview {
  holders: number;
  tickets: number;
  faceZar: string;
  resaleExtraZar: string;
  totalZar: string;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(API_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("OFFLINE", "Can't reach Siyangena right now. Check your connection and try again.");
  }
  const json = await res.json().catch(() => ({}));
  if (!json.success) throw new ApiError(json.code ?? String(res.status), json.message ?? res.statusText);
  return json.data as T;
}

const realApi: Api = {
  listEvents: () => call("GET", "/drops"),
  getEvent: (id) => call("GET", `/drops/${id}`),
  listings: (eventId) => call("GET", `/drops/${eventId}/listings`),
  subscribe: (onEvent) => {
    const source = new EventSource(`${API_URL}/events`);
    source.onmessage = (msg) => {
      try {
        onEvent(JSON.parse(msg.data));
      } catch {
        /* keep-alives */
      }
    };
    return () => source.close();
  },
  me: () => call("GET", "/me"),
  setup: () => call("POST", "/me/setup", {}),
  verify: () => call("POST", "/me/verify", {}),
  wallet: (eventId) => call("GET", `/me/wallet${eventId ? `?eventId=${eventId}` : ""}`),
  topUp: (amountZar) => call("POST", "/me/topup", { amountZar }),
  tickets: (eventId) => call("GET", `/me/tickets${eventId ? `?eventId=${eventId}` : ""}`),
  apply: (input) => call("POST", "/me/promoter-application", input),
  myAgents: () => call("GET", "/me/agents"),
  getMandate: (eventId) => call("GET", `/me/events/${eventId}/mandate`),
  putMandate: (eventId, body) => call("PUT", `/me/events/${eventId}/mandate`, body),
  buy: (eventId, quantity) => call("POST", `/me/events/${eventId}/buy`, { quantity }),
  purchase: (requestId) => call("GET", `/me/purchases/${requestId}`),
  runAgent: (eventId, goal, priceZar) => call("POST", `/me/events/${eventId}/agent`, { goal, priceZar }),
  resell: (eventId, priceZar) => call("POST", `/me/events/${eventId}/resell`, { priceZar }),
  buyListing: (listingId) => call("POST", `/me/listings/${listingId}/buy`, {}),
  wishes: () => call("GET", "/me/wishes"),
  addWish: (body) => call("POST", "/me/wishes", body),
  removeWish: (id) => call("DELETE", `/me/wishes/${id}`),
  alerts: () => call("GET", "/me/alerts"),
  readAlerts: () => call("POST", "/me/alerts/read", {}),
  ticketPass: (eventId) => call("GET", `/me/events/${eventId}/pass`),
  updateProfile: (body) => call("PATCH", "/me", body),
  updatePromoterDetails: (body) => call("PATCH", "/me/promoter-details", body),
  transfers: () => call("GET", "/me/transfers"),
  deposit: (body) => call("POST", "/me/deposits", body),
  cashOut: (body) => call("POST", "/me/cashouts", body),
  resubmitEvent: (id) => call("POST", `/promoter/events/${id}/resubmit`, {}),
  editEvent: (id, body) => call("PATCH", `/promoter/events/${id}/details`, body),
  myEvents: () => call("GET", "/promoter/events"),
  createEvent: (body) => call("POST", "/promoter/events", body),
  openSales: (id) => call("POST", `/promoter/events/${id}/open`, {}),
  closeSales: (id) => call("POST", `/promoter/events/${id}/close`, {}),
  updateEvent: (id, body) => call("PATCH", `/promoter/events/${id}`, body),
  stats: (id) => call("GET", `/promoter/events/${id}/stats`),
  demand: (plan) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(plan)) if (v !== undefined && v !== "") q.set(k, String(v));
    return call("GET", `/promoter/demand?${q.toString()}`);
  },
  cancelPreview: (id) => call("GET", `/promoter/events/${id}/cancel-preview`),
  cancelEvent: (id, reason) => call("POST", `/promoter/events/${id}/cancel`, { reason, confirm: "CANCEL" }),
  checkIn: (id, code) => call("POST", `/promoter/events/${id}/checkin`, { code }),
  doorStats: (id) => call("GET", `/promoter/events/${id}/door`),
  payouts: () => call("GET", "/promoter/payouts"),
  requestPayout: (eventId) => call("POST", "/promoter/payouts/request", { eventId }),
  applications: (status) => call("GET", `/admin/applications${status ? `?status=${status}` : ""}`),
  review: (userId, decision, note) => call("POST", `/admin/applications/${userId}/review`, { decision, note }),
  users: () => call("GET", "/admin/users"),
  setRole: (userId, role) => call("POST", `/admin/users/${userId}/role`, { role }),
  allPayouts: () => call("GET", "/admin/payouts"),
  markPayoutPaid: (id) => call("POST", `/admin/payouts/${id}/paid`, {}),
  eventsInReview: () => call("GET", "/admin/events/review"),
  reviewEvent: (id, decision, note) => call("POST", `/admin/events/${id}/review`, { decision, note }),
  changeRequests: () => call("GET", "/admin/change-requests"),
  reviewChange: (userId, decision, note) => call("POST", `/admin/change-requests/${userId}/review`, { decision, note }),
};

export const api: Api = MOCK ? mockApi : realApi;
