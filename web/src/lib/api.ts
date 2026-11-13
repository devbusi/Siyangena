import type {
  CreateDropRequest,
  Drop,
  DropEvent,
  Fan,
  FanTickets,
  FanWallet,
  Listing,
  Mandate,
  PromoterStats,
  PutMandateRequest,
  UpdateDropRequest,
} from "@drop/shared";
import { API_URL, HUMAN_KEY, MOCK } from "./config";
import { mockApi } from "./mock";

export type AgentGoal = "buy" | "resale" | "sell";

export interface Api {
  getDrop(): Promise<Drop>;
  getFans(): Promise<Fan[]>;
  getWallet(fanId: string): Promise<FanWallet>;
  getTickets(fanId: string): Promise<FanTickets>;
  getMandate(fanId: string): Promise<Mandate | null>;
  putMandate(fanId: string, body: PutMandateRequest): Promise<Mandate>;
  verifyFan(fanId: string): Promise<Fan>;
  listListings(): Promise<Listing[]>;
  runAgent(fanId: string, goal: AgentGoal, priceZar?: number): Promise<void>;
  createDrop(body: CreateDropRequest): Promise<Drop>;
  openSales(): Promise<Drop>;
  closeSales(): Promise<Drop>;
  updateDrop(body: UpdateDropRequest): Promise<Drop>;
  getStats(): Promise<PromoterStats>;
  subscribe(onEvent: (event: DropEvent) => void): () => void;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, human = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (human && HUMAN_KEY) headers.Authorization = `Bearer ${HUMAN_KEY}`;
  let res: Response;
  try {
    res = await fetch(API_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("OFFLINE", "Can't reach Siyangena right now. Check that the backend is running.");
  }
  const json = await res.json().catch(() => ({}));
  if (!json.success) throw new ApiError(json.code ?? String(res.status), json.message ?? res.statusText);
  return json.data as T;
}

const realApi: Api = {
  getDrop: () => call("GET", "/drop"),
  getFans: () => call("GET", "/fans"),
  getWallet: (id) => call("GET", `/fans/${id}/wallet`),
  getTickets: (id) => call("GET", `/fans/${id}/tickets`),
  getMandate: async (id) => {
    try {
      return await call<Mandate>("GET", `/fans/${id}/mandate`);
    } catch (error) {
      if (error instanceof ApiError && error.code === "NO_MANDATE") return null;
      throw error;
    }
  },
  putMandate: (id, body) => call("PUT", `/fans/${id}/mandate`, body, true),
  verifyFan: (id) => call("POST", `/fans/${id}/verify`, {}, true),
  listListings: () => call("GET", "/resale/listings"),
  runAgent: (id, goal, priceZar) => call("POST", `/agents/${id}/run`, { goal, priceZar }, true),
  createDrop: (body) => call("POST", "/promoter/drop", body, true),
  openSales: () => call("POST", "/promoter/drop/open", {}, true),
  closeSales: () => call("POST", "/promoter/drop/close", {}, true),
  updateDrop: (body) => call("PATCH", "/promoter/drop", body, true),
  getStats: () => call("GET", "/promoter/stats", undefined, true),
  subscribe: (onEvent) => {
    const source = new EventSource(`${API_URL}/events`);
    source.onmessage = (msg) => {
      try {
        onEvent(JSON.parse(msg.data));
      } catch {
        /* ignore keep-alives */
      }
    };
    return () => source.close();
  },
};

export const api: Api = MOCK ? mockApi : realApi;
