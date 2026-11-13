import type { Fan, FanTickets, FanWallet, LedgerItem } from "@drop/shared";
import { Wallet } from "xrpl";
import { state, save } from "../../lib/store";
import { forbidden, notFound } from "../../lib/utils/errors";
import { nowIso } from "../../lib/utils/ids";
import { settleToZar } from "../../lib/utils/money";
import { xrplWallet } from "../../xrpl/xrpl.wallet";
import { xrplCredentials } from "../../xrpl/xrpl.credentials";
import { xrplMpt } from "../../xrpl/xrpl.mpt";
import { xrplPayments } from "../../xrpl/xrpl.payments";
import { xrplClient } from "../../xrpl/xrpl.client";
import { xrplExplorer } from "../../xrpl/xrpl.explorer";
import { Drop } from "../drop-logic/Drop";

// Demo cast from docs/PLAN.md section 2. Each fan has a main wallet (funds the agent)
// and an agent wallet (holds the Credential, the tickets and the allowance).
// The scalper only has an agent wallet. The scammer is not a fan: it never gets verified.
const CAST = [
  { id: "thandi", name: "Thandi", seedEnv: "THANDI_SEED", agentSeedEnv: "THANDI_AGENT_SEED" },
  { id: "sipho", name: "Sipho", seedEnv: "SIPHO_SEED", agentSeedEnv: "SIPHO_AGENT_SEED" },
  { id: "scalper", name: "Scalper", seedEnv: null, agentSeedEnv: "SCALPER_AGENT_SEED" },
] as const;

export interface FanContext {
  id: string;
  name: string;
  main: Wallet | null;
  agent: Wallet;
}

const dropService = new Drop();

function okOrDuplicate(result: string) {
  return result === "tesSUCCESS" || result === "tecDUPLICATE";
}

export class Fans {
  private context(def: (typeof CAST)[number]): FanContext | null {
    const agent = xrplWallet.fromEnv(def.agentSeedEnv);
    if (!agent) return null;
    return {
      id: def.id,
      name: def.name,
      main: def.seedEnv ? xrplWallet.fromEnv(def.seedEnv) : null,
      agent,
    };
  }

  getContext(fanId: string): FanContext {
    const def = CAST.find((f) => f.id === fanId);
    const ctx = def ? this.context(def) : null;
    if (!ctx) throw notFound(`Fan ${fanId} not found (is ${def?.agentSeedEnv ?? "their seed"} set in .env?)`);
    return ctx;
  }

  // Look up which fan owns an agent address (used by the sale watcher).
  findByAgentAddress(address: string): FanContext | null {
    for (const def of CAST) {
      const ctx = this.context(def);
      if (ctx?.agent.address === address) return ctx;
    }
    return null;
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
    return CAST.map((def) => this.context(def))
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
      throw forbidden("NOT_VERIFIED", `${fanId} is not a verified fan`);
    }
  }

  // Promoter issues the Credential to the agent wallet, the agent accepts it,
  // the agent opts in to the official issuance, and the promoter authorises it.
  // Idempotent: steps already on the ledger are skipped.
  async verifyFan(fanId: string): Promise<Fan> {
    const ctx = this.getContext(fanId);
    const drop = dropService.getRecord();
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

    const holding = await xrplMpt.getHolding(ctx.agent.address, drop.issuanceId);
    if (!holding.optedIn) {
      const optIn = await xrplMpt.holderOptIn(ctx.agent, drop.issuanceId);
      if (!okOrDuplicate(optIn.result)) throw new Error(`MPTokenAuthorize (opt-in) failed: ${optIn.result}`);
    }
    if (!holding.authorized) {
      const auth = await xrplMpt.authorizeHolder(ctx.agent.address, drop.issuanceId);
      if (auth.result !== "tesSUCCESS") throw new Error(`MPTokenAuthorize (issuer) failed: ${auth.result}`);
      record.authTx = auth.hash;
    }

    record.verified = true;
    save();
    return this.toView(ctx);
  }

  async getTicketCount(fanId: string): Promise<number> {
    const ctx = this.getContext(fanId);
    if (!state.drop) return 0;
    return xrplMpt.getTicketBalance(ctx.agent.address, state.drop.issuanceId);
  }

  async getWallet(fanId: string): Promise<FanWallet> {
    const ctx = this.getContext(fanId);
    const [allowance, xrp, tickets] = await Promise.all([
      xrplPayments.getSettleBalance(ctx.agent.address),
      xrplClient.getXrpBalance(ctx.agent.address),
      this.getTicketCount(fanId),
    ]);
    return {
      allowanceRlusd: allowance,
      allowanceZar: settleToZar(allowance),
      xrp: String(xrp),
      tickets,
    };
  }

  async getTickets(fanId: string): Promise<FanTickets> {
    return {
      count: await this.getTicketCount(fanId),
      history: [...(state.history[fanId] ?? [])].reverse(),
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
