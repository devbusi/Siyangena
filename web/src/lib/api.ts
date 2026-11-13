import type {
  AdminUser,
  ApplicationStatus,
  CreateDropRequest,
  Drop,
  DropEvent,
  FanTickets,
  FanWallet,
  Listing,
  Mandate,
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
  getMandate(eventId: string): Promise<Mandate | null>;
  putMandate(eventId: string, body: PutMandateRequest): Promise<Mandate>;
  buy(eventId: string, quantity: number): Promise<{ requestId: string }>;
  purchase(requestId: string): Promise<{ status: string } | null>;
  runAgent(eventId: string, goal: AgentGoal, priceZar?: number): Promise<void>;
  resell(eventId: string, priceZar: number): Promise<Listing>;
  buyListing(listingId: string): Promise<SubmitSignatureResponse>;
  // Promoter
  myEvents(): Promise<Drop[]>;
  createEvent(body: CreateDropRequest): Promise<Drop>;
  openSales(eventId: string): Promise<Drop>;
  closeSales(eventId: string): Promise<Drop>;
  updateEvent(eventId: string, body: UpdateDropRequest): Promise<Drop>;
  stats(eventId: string): Promise<PromoterStats>;
  // Admin
  applications(status?: ApplicationStatus): Promise<PromoterApplication[]>;
  review(userId: string, decision: ApplicationStatus, note?: string): Promise<PromoterApplication>;
  users(): Promise<AdminUser[]>;
  setRole(userId: string, role: Role): Promise<void>;
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
  getMandate: (eventId) => call("GET", `/me/events/${eventId}/mandate`),
  putMandate: (eventId, body) => call("PUT", `/me/events/${eventId}/mandate`, body),
  buy: (eventId, quantity) => call("POST", `/me/events/${eventId}/buy`, { quantity }),
  purchase: (requestId) => call("GET", `/me/purchases/${requestId}`),
  runAgent: (eventId, goal, priceZar) => call("POST", `/me/events/${eventId}/agent`, { goal, priceZar }),
  resell: (eventId, priceZar) => call("POST", `/me/events/${eventId}/resell`, { priceZar }),
  buyListing: (listingId) => call("POST", `/me/listings/${listingId}/buy`, {}),
  myEvents: () => call("GET", "/promoter/events"),
  createEvent: (body) => call("POST", "/promoter/events", body),
  openSales: (id) => call("POST", `/promoter/events/${id}/open`, {}),
  closeSales: (id) => call("POST", `/promoter/events/${id}/close`, {}),
  updateEvent: (id, body) => call("PATCH", `/promoter/events/${id}`, body),
  stats: (id) => call("GET", `/promoter/events/${id}/stats`),
  applications: (status) => call("GET", `/admin/applications${status ? `?status=${status}` : ""}`),
  review: (userId, decision, note) => call("POST", `/admin/applications/${userId}/review`, { decision, note }),
  users: () => call("GET", "/admin/users"),
  setRole: (userId, role) => call("POST", `/admin/users/${userId}/role`, { role }),
};

export const api: Api = MOCK ? mockApi : realApi;
