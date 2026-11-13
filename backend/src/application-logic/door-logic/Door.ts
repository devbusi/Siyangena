import crypto from "crypto";
import type { CheckinResult, DoorStats, TicketPass } from "@drop/shared";
import { state, save } from "../../lib/store";
import { forbidden } from "../../lib/utils/errors";
import { nowIso } from "../../lib/utils/ids";
import { xrplMpt } from "../../xrpl/xrpl.mpt";
import { Fans } from "../fan-logic/Fans";
import { accounts } from "../account-logic/Accounts";
import { Drop } from "../drop-logic/Drop";

const dropService = new Drop();
const fanService = new Fans();

// The code on a ticket changes every minute, so a screenshot stops working fast.
const PASS_TTL_MS = 60_000;
const SECRET = process.env.PASS_SECRET || process.env.WALLET_ENCRYPTION_KEY || process.env.HUMAN_API_KEY || crypto.randomBytes(32).toString("hex");

function sign(payload: string) {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url").slice(0, 22);
}

function nameFor(address: string): string {
  const userId = accounts.userByAddress(address);
  if (userId) {
    const full = accounts.cachedProfile(userId)?.fullName?.trim();
    if (full) {
      const [first, ...rest] = full.split(/\s+/);
      return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
    }
    return "Fan";
  }
  return fanService.allContexts().find((c) => c.agent.address === address)?.name ?? "Fan";
}

export class Door {
  // A fresh code for the fan's ticket QR.
  async pass(fanId: string, eventId: string): Promise<TicketPass> {
    const drop = dropService.getRecord(eventId);
    const ctx = fanService.getContext(fanId);
    const held = await xrplMpt.getTicketBalance(ctx.agent.address, drop.issuanceId).catch(() => 0);
    if (held < 1) throw forbidden("NO_TICKET", "You don't hold a ticket for this event");
    const exp = Date.now() + PASS_TTL_MS;
    const payload = `${drop.id}.${ctx.agent.address}.${exp}`;
    return { code: `S1.${payload}.${sign(payload)}`, expiresAt: new Date(exp).toISOString() };
  }

  private turnAway(eventId: string, result: CheckinResult): CheckinResult {
    state.turnedAway[eventId] = (state.turnedAway[eventId] ?? 0) + 1;
    save();
    return result;
  }

  // Scan at the door: the code must be genuine and fresh, and the wallet must still hold
  // more tickets on the ledger than it has already used to get in.
  async checkIn(eventId: string, code: string): Promise<CheckinResult> {
    const drop = dropService.getRecord(eventId);
    const parts = code.trim().split(".");
    if (parts.length !== 5 || parts[0] !== "S1") return this.turnAway(eventId, { ok: false, reason: "bad_code", message: "That isn't a Siyangena ticket" });
    const [, codeEvent, address, expRaw, sig] = parts;
    const payload = `${codeEvent}.${address}.${expRaw}`;
    const genuine = sig.length === 22 && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(payload)));
    if (!genuine) return this.turnAway(eventId, { ok: false, reason: "bad_code", message: "This code wasn't made by Siyangena" });
    if (codeEvent !== drop.id) return this.turnAway(eventId, { ok: false, reason: "wrong_event", message: "This ticket is for a different event" });
    if (drop.state === "cancelled") return this.turnAway(eventId, { ok: false, reason: "cancelled", message: "This event was cancelled and refunded" });
    if (Number(expRaw) < Date.now()) return this.turnAway(eventId, { ok: false, reason: "expired", message: "Old code, likely a screenshot. Ask them to open the ticket in the app." });

    const held = await xrplMpt.getTicketBalance(address, drop.issuanceId).catch(() => 0);
    const fanName = nameFor(address);
    if (held < 1) return this.turnAway(eventId, { ok: false, reason: "no_ticket", message: "This wallet holds no ticket for this event", fanName });

    const list = (state.checkins[drop.id] ??= []);
    const used = list.filter((c) => c.address === address);
    if (used.length >= held) {
      const last = used[used.length - 1];
      const when = new Date(last.at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });
      return this.turnAway(eventId, {
        ok: false,
        reason: "used",
        message: `Already used. Scanned at ${when}.`,
        fanName,
        of: held,
        at: last.at,
      });
    }
    const at = nowIso();
    list.push({ address, fanId: accounts.userByAddress(address) ?? undefined, at });
    save();
    return { ok: true, message: "Let them in", fanName, ticket: used.length + 1, of: held, at };
  }

  stats(eventId: string): DoorStats {
    const drop = dropService.getRecord(eventId);
    return { checkedIn: (state.checkins[drop.id] ?? []).length, sold: drop.sold, turnedAway: state.turnedAway[drop.id] ?? 0 };
  }
}
