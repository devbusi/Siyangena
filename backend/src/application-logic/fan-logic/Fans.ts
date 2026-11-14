import type { Fan, FanTickets, FanWallet, LedgerItem } from "@drop/shared";
import { Wallet } from "xrpl";
import { state, save } from "../../lib/store";
import { forbidden, notFound } from "../../lib/utils/errors";
import { nowIso } from "../../lib/utils/ids";
import { settleToZar } from "../../lib/utils/money";
import { supabaseConfigured } from "../../lib/supabase";
import { xrplWallet } from "../../xrpl/xrpl.wallet";
import { xrplCredentials } from "../../xrpl/xrpl.credentials";
import { xrplMpt } from "../../xrpl/xrpl.mpt";
import { xrplPayments } from "../../xrpl/xrpl.payments";
import { xrplClient } from "../../xrpl/xrpl.client";
import { xrplExplorer } from "../../xrpl/xrpl.explorer";
import { xrplConfig } from "../../xrpl/xrpl.config";
import { accounts } from "../account-logic/Accounts";

// Demo cast for the scripted demo, with seeds in .env. Each has an agent wallet
// that holds the Credential, the tickets and the allowance.
// Real accounts (Supabase users) work the same way with one server-held wallet each.
const CAST = [
  { id: "thandi", name: "Thandi", seedEnv: "THANDI_SEED", agentSeedEnv: "THANDI_AGENT_SEED" },
  { id: "sipho", name: "Sipho", seedEnv: "SIPHO_SEED", agentSeedEnv: "SIPHO_AGENT_SEED" },
  { id: "scalper", name: "Scalper", seedEnv: null, agentSeedEnv: "SCALPER_AGENT_SEED" },
] as const;

export const DEMO_FAN_IDS: string[] = CAST.map((c) => c.id);

export interface FanContext {
  id: string;
  name: string;
  main: Wallet | null;
  agent: Wallet;
  custodial: boolean; // a real account whose wallet the server holds
}

function okOrDuplicate(result: string) {
  return result === "tesSUCCESS" || result === "tecDUPLICATE";
}

// Lazy to avoid an import cycle with Drop.
function dropRecord(eventId?: string) {
  const { Drop } = require("../drop-logic/Drop") as typeof import("../drop-logic/Drop");
  return new Drop().getRecord(eventId);
}

const authorized = new Set<string>(); // `${address}:${issuanceId}` already checked

export class Fans {
  private castContext(def: (typeof CAST)[number]): FanContext | null {
    const agent = xrplWallet.fromEnv(def.agentSeedEnv);
    if (!agent) return null;
    return {
      id: def.id,
      name: def.name,
      main: def.seedEnv ? xrplWallet.fromEnv(def.seedEnv) : null,
      agent,
      custodial: false,
    };
  }

  findContext(fanId: string): FanContext | null {
    const def = CAST.find((f) => f.id === fanId);
    if (def) return this.castContext(def);
    const wallet = accounts.walletFor(fanId);
    if (!wallet) return null;
    const profile = accounts.cachedProfile(fanId);
    return { id: fanId, name: profile?.fullName || "Fan", main: null, agent: wallet, custodial: true };
  }

  // Every fan with a wallet: the demo cast and signed-up accounts.
  allContexts(): FanContext[] {
    const list: FanContext[] = [];
    for (const def of CAST) {
      const ctx = this.castContext(def);
      if (ctx) list.push(ctx);
    }
    for (const id of accounts.userIds()) {
      const ctx = this.findContext(id);
      if (ctx) list.push(ctx);
    }
    return list;
  }

  getContext(fanId: string): FanContext {
    const ctx = this.findContext(fanId);
    if (!ctx) {
      const def = CAST.find((f) => f.id === fanId);
      throw notFound(
        def ? `Fan ${fanId} not found (is ${def.agentSeedEnv} set in .env?)` : `No ticket wallet for this account yet. Finish setting up first.`,
      );
    }
    return ctx;
  }

  // Look up which fan owns an agent address (used by the sale watcher).
  findByAgentAddress(address: string): FanContext | null {
    for (const def of CAST) {
      const ctx = this.castContext(def);
      if (ctx?.agent.address === address) return ctx;
    }
    const userId = accounts.userByAddress(address);
    return userId ? this.findContext(userId) : null;
  }

  toView(ctx: FanContext): Fan {
    const record = state.fans[ctx.id];
    return {
      id: ctx.id,
      name: ctx.name,
      address: ctx.main?.address ?? ctx.agent.address,
      agentAddress: ctx.agent.address,
      verified: record?.verified ?? false,
      ...(record?.credentialTx ? { credentialTx: record.credentialTx } : {}),
      ...(record?.authTx ? { authTx: record.authTx } : {}),
    };
  }

  listFans(): Fan[] {
    return CAST.map((def) => this.castContext(def))
      .filter((ctx): ctx is FanContext => ctx !== null)
      .map((ctx) => this.toView(ctx));
  }

  getFan(fanId: string): Fan {
    return this.toView(this.getContext(fanId));
  }

  isVerified(fanId: string): boolean {
    return state.fans[fanId]?.verified ?? false;
  }

  assertVerified(fanId: string) {
    if (!this.isVerified(fanId)) {
      throw forbidden("NOT_VERIFIED", "Verify your account first: one real person, one ticket wallet");
    }
  }

  // The promoter issues the "verified fan" Credential and the wallet accepts it.
  // For the demo cast it also opts in to the featured event, as before.
  async verifyFan(fanId: string): Promise<Fan> {
    const ctx = this.getContext(fanId);
    const record = (state.fans[fanId] ??= { verified: false });

    const credential = await xrplCredentials.getCredential(ctx.agent.address);
    if (!credential.exists) {
      const created = await xrplCredentials.createCredential(ctx.agent.address);
      if (!okOrDuplicate(created.result)) throw new Error(`CredentialCreate failed: ${created.result}`);
      record.credentialTx = created.hash;
    }
    if (!credential.accepted) {
      const accepted = await xrplCredentials.acceptCredential(ctx.agent);
      if (!okOrDuplicate(accepted.result)) throw new Error(`CredentialAccept failed: ${accepted.result}`);
    }

    if (!ctx.custodial) {
      try {
        const drop = dropRecord();
        record.authTx = (await this.ensureEventAccess(fanId, drop.id)) ?? record.authTx;
      } catch {
        // No event yet: the fan is still verified, access comes with their first purchase.
      }
    }

    record.verified = true;
    save();
    if (ctx.custodial && supabaseConfigured()) await accounts.setVerified(fanId, true);
    return this.toView(ctx);
  }

  // Tickets are per event: the wallet opts in to that event's issuance and the promoter
  // authorises it. Done once per wallet and event, right before the first purchase.
  async ensureEventAccess(fanId: string, eventId: string): Promise<string | undefined> {
    const ctx = this.getContext(fanId);
    const drop = dropRecord(eventId);
    const key = `${ctx.agent.address}:${drop.issuanceId}`;
    if (authorized.has(key)) return undefined;

    const holding = await xrplMpt.getHolding(ctx.agent.address, drop.issuanceId);
    if (!holding.optedIn) {
      const optIn = await xrplMpt.holderOptIn(ctx.agent, drop.issuanceId);
      if (!okOrDuplicate(optIn.result)) throw new Error(`MPTokenAuthorize (opt-in) failed: ${optIn.result}`);
    }
    let authTx: string | undefined;
    if (!holding.authorized) {
      const auth = await xrplMpt.authorizeHolder(ctx.agent.address, drop.issuanceId);
      if (auth.result !== "tesSUCCESS") throw new Error(`MPTokenAuthorize (issuer) failed: ${auth.result}`);
      authTx = auth.hash;
    }
    authorized.add(key);
    return authTx;
  }

  async getTicketCount(fanId: string, eventId?: string): Promise<number> {
    const ctx = this.getContext(fanId);
    let drop;
    try {
      drop = dropRecord(eventId);
    } catch {
      return 0;
    }
    if (!drop.issuanceId) return 0;
    return xrplMpt.getTicketBalance(ctx.agent.address, drop.issuanceId);
  }

  async getWallet(fanId: string, eventId?: string): Promise<FanWallet> {
    const ctx = this.getContext(fanId);
    // One slow or failed lookup should not take the whole wallet down: log it and show zero.
    const safe = <T,>(label: string, p: Promise<T>, fallback: T) =>
      p.catch((error) => {
        console.error(`Wallet ${label} lookup failed for ${ctx.agent.address}:`, error?.data?.error ?? error?.message ?? error);
        return fallback;
      });
    const [allowance, xrp, tickets] = await Promise.all([
      safe("balance", xrplPayments.getSettleBalance(ctx.agent.address), "0"),
      safe("XRP", xrplClient.getXrpBalance(ctx.agent.address), 0),
      safe("ticket", this.getTicketCount(fanId, eventId), 0),
    ]);
    // On XRP the ledger locks a small reserve in every wallet: don't count it as spendable.
    const spend = xrplConfig.settleAsset === "XRP" ? String(Math.max(0, Number(allowance) - 3).toFixed(6)) : allowance;
    return {
      allowanceRlusd: spend,
      allowanceZar: settleToZar(spend),
      xrp: String(xrp),
      tickets,
    };
  }

  async getTickets(fanId: string, eventId?: string): Promise<FanTickets> {
    const ctx = this.getContext(fanId);
    // Cancelled events were refunded, so their tickets no longer show.
    const drops = Object.values(state.drops).filter((d) => d.issuanceId && d.state !== "cancelled");
    const counts = await Promise.all(
      drops.map(async (d) => ({
        eventId: d.id,
        name: d.name,
        venue: d.venue,
        startsAt: d.startsAt,
        count: await xrplMpt.getTicketBalance(ctx.agent.address, d.issuanceId).catch(() => 0),
      })),
    );
    const held = counts.filter((c) => c.count > 0);
    const count = eventId ? (held.find((c) => c.eventId === eventId)?.count ?? 0) : held.reduce((n, c) => n + c.count, 0);
    return {
      count,
      events: held,
      history: [...(state.history[fanId] ?? [])].filter((h) => !eventId || !h.eventId || h.eventId === eventId).reverse(),
    };
  }

  addHistory(fanId: string, item: Omit<LedgerItem, "at" | "explorerUrl">) {
    const entry: LedgerItem = {
      ...item,
      at: nowIso(),
      ...(item.txHash ? { explorerUrl: xrplExplorer.transactionUrl(item.txHash) } : {}),
    };
    (state.history[fanId] ??= []).push(entry);
    save();
  }
}
