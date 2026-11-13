import { Request, Response, NextFunction } from "express";
import type { Role } from "@drop/shared";
import { db, supabaseConfigured } from "../lib/supabase";
import { accounts } from "../application-logic/account-logic/Accounts";
import { DEMO_FAN_IDS } from "../application-logic/fan-logic/Fans";

// Who is calling:
//   user   a signed-in person (Supabase access token in "Authorization: Bearer ...")
//   agent  a fan's agent process, started by this backend (X-Agent-Key + X-Agent-Fan)
//   admin  the HUMAN_API_KEY bearer, used by the setup and demo scripts
//   anon   nobody signed in
export type Actor =
  | { kind: "user"; id: string; role: Role; email: string; name: string }
  | { kind: "agent"; fanId: string }
  | { kind: "admin"; id: "admin-key" }
  | { kind: "anon" };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

const tokenCache = new Map<string, { actor: Actor; until: number }>();

function deny(res: Response, status: number, message: string) {
  return res.status(status).json({ success: false, code: "UNAUTHORIZED", message });
}

async function actorFromToken(token: string): Promise<Actor> {
  const cached = tokenCache.get(token);
  if (cached && cached.until > Date.now()) return cached.actor;
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) return { kind: "anon" };
  const user = data.user;
  const profile =
    accounts.cachedProfile(user.id) ??
    (await accounts.ensureProfile({
      id: user.id,
      email: user.email ?? undefined,
      fullName: (user.user_metadata?.full_name as string | undefined) ?? undefined,
      role: user.user_metadata?.role as string | undefined,
    }));
  const actor: Actor = {
    kind: "user",
    id: user.id,
    role: profile.role,
    email: user.email ?? profile.email,
    name: profile.fullName || user.email || "Fan",
  };
  tokenCache.set(token, { actor, until: Date.now() + 60_000 });
  return actor;
}

// Runs on every request: works out the actor, never blocks.
export async function identify(req: Request, _res: Response, next: NextFunction) {
  req.actor = { kind: "anon" };
  try {
    const agentKey = process.env.AGENT_API_KEY;
    const headerKey = req.header("x-agent-key");
    const fan = req.header("x-agent-fan");
    if (agentKey && headerKey && headerKey === agentKey && fan) {
      req.actor = { kind: "agent", fanId: fan };
      return next();
    }
    const auth = req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!token) return next();
    if (process.env.HUMAN_API_KEY && token === process.env.HUMAN_API_KEY) {
      req.actor = { kind: "admin", id: "admin-key" };
      return next();
    }
    if (supabaseConfigured()) req.actor = await actorFromToken(token);
  } catch (error) {
    console.error("Auth check failed:", error instanceof Error ? error.message : error);
  }
  next();
}

// Forget a cached role (after an admin changes it).
export function forgetUser(userId: string) {
  for (const [token, entry] of tokenCache) {
    if (entry.actor.kind === "user" && entry.actor.id === userId) tokenCache.delete(token);
  }
}

// Local demo mode: no Supabase and no HUMAN_API_KEY means everything is open, as before.
function openDevMode() {
  return !supabaseConfigured() && !process.env.HUMAN_API_KEY;
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (req.actor?.kind === "user") return next();
  return deny(res, 401, "Sign in first");
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const a = req.actor;
    if (a?.kind === "admin" || openDevMode()) return next();
    if (a?.kind === "user" && (roles.includes(a.role) || a.role === "admin")) return next();
    return deny(res, 403, `This needs a ${roles.join(" or ")} account`);
  };
}

// The caller may act for this fan: the fan themselves, their agent, or an admin.
// The demo cast (thandi, sipho, scalper) stays open so the scripted demo keeps working.
export function canActFor(req: Request, fanId: string): boolean {
  const a = req.actor;
  if (openDevMode()) return true;
  if (DEMO_FAN_IDS.includes(fanId) && process.env.DEMO_CAST !== "off") return true;
  if (!a) return false;
  if (a.kind === "admin") return true;
  if (a.kind === "agent") return a.fanId === fanId;
  if (a.kind === "user") return a.id === fanId || a.role === "admin";
  return false;
}

// Guard for routes where the fan id is in the URL (:id) or the body (fanId / buyerFanId).
export function requireFanAccess(from: "param" | "body", field = from === "param" ? "id" : "fanId") {
  return (req: Request, res: Response, next: NextFunction) => {
    const fanId = from === "param" ? (req.params as any)[field] : req.body?.[field];
    if (typeof fanId === "string" && canActFor(req, fanId)) return next();
    return deny(res, 403, "You can only act for your own account");
  };
}

// Human-only: a signed-in person or the admin key. Agents never pass this.
export function requireHumanFor(from: "param" | "body", field = from === "param" ? "id" : "fanId") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (openDevMode()) return next();
    const a = req.actor;
    const fanId = from === "param" ? (req.params as any)[field] : req.body?.[field];
    if (a?.kind === "admin") return next();
    if (a?.kind === "user" && (a.id === fanId || a.role === "admin")) return next();
    return deny(res, 403, "Only you can change this, not your agent");
  };
}
