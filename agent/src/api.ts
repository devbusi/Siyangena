// Thin client for the promoter service. Agents never get HUMAN_API_KEY,
// so they can read their mandate but every write to it is refused.

const BASE = (process.env.BACKEND_URL || "http://localhost:4000").replace(/\/$/, "") + "/api";

export interface ApiOk<T> {
  ok: true;
  data: T;
}
export interface ApiErr {
  ok: false;
  status: number;
  code: string;
  message: string;
}
export type ApiResult<T> = ApiOk<T> | ApiErr;

async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json.success) return { ok: true, data: json.data as T };
    return {
      ok: false,
      status: res.status,
      code: json.code ?? "HTTP_" + res.status,
      message: json.message ?? res.statusText,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: "BACKEND_UNREACHABLE",
      message: `Could not reach the promoter service at ${BASE}: ${error instanceof Error ? error.message : error}`,
    };
  }
}

export const api = {
  get: <T>(path: string) => call<T>("GET", path),
  post: <T>(path: string, body?: unknown) => call<T>("POST", path, body ?? {}),
};
