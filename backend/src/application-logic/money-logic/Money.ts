import crypto from "crypto";
import { Wallet } from "xrpl";
import type { BankTransfer } from "@drop/shared";
import { state, save } from "../../lib/store";
import { ApiError, badRequest, conflict } from "../../lib/utils/errors";
import { newId, nowIso } from "../../lib/utils/ids";
import { zar, zarToSettle } from "../../lib/utils/money";
import { xrplClient } from "../../xrpl/xrpl.client";
import { xrplConfig } from "../../xrpl/xrpl.config";
import { xrplPayments } from "../../xrpl/xrpl.payments";
import { xrplExplorer } from "../../xrpl/xrpl.explorer";
import { settleAmount } from "../../xrpl/xrpl.amounts";
import { accounts } from "../account-logic/Accounts";

// "Siyangena Pay (test)": a simulated card and bank gateway. The card or bank side is
// pretend; the money side is real ledger payments between the platform's bank wallet
// (its float) and the fan's wallet. In production the gateway becomes a South African
// payment provider, and the float is converted to and from rand by a licensed exchange.

const CLEARING_MS = 15_000; // a simulated bank transfer clears after this long

export const TEST_CARDS = {
  approve: "4242424242424242",
  decline: "4000000000000002",
};

function reference(prefix: string) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function bankWallet(): Wallet {
  const seed = process.env.BANK_SEED;
  if (!seed) throw badRequest("INVALID_STATE", "The test bank isn't set up: BANK_SEED is missing on the server");
  return Wallet.fromSeed(seed);
}

export function bankAddress(): string {
  return bankWallet().address;
}

type Rec = BankTransfer & { userId: string };

function view(t: Rec): BankTransfer {
  // Simulated bank clearing: processing cash-outs land after a short while.
  if (t.kind === "cashout" && t.status === "processing" && Date.now() - new Date(t.createdAt).getTime() > CLEARING_MS) {
    t.status = "completed";
    t.completedAt = new Date(new Date(t.createdAt).getTime() + CLEARING_MS).toISOString();
    save();
  }
  const { userId: _u, ...rest } = t;
  return rest;
}

// Money a fan can actually move: on XRP the ledger keeps a reserve in every wallet.
async function spendable(address: string): Promise<number> {
  const balance = Number(await xrplPayments.getSettleBalance(address));
  return xrplConfig.settleAsset === "XRP" ? Math.max(0, balance - 3) : balance;
}

export class Money {
  list(userId: string): BankTransfer[] {
    return Object.values(state.transfers)
      .filter((t) => t.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(view);
  }

  // Card or instant EFT in. On approval the bank wallet pays the fan's wallet on the ledger.
  async deposit(
    userId: string,
    input: { amountZar: number; method: "card" | "eft"; cardNumber?: string; bank?: string },
  ): Promise<BankTransfer> {
    let method: string;
    if (input.method === "card") {
      const digits = (input.cardNumber ?? "").replace(/\D/g, "");
      if (digits === TEST_CARDS.decline) throw new ApiError(402, "DECLINED", "Your bank declined this card. Try another card.");
      if (digits !== TEST_CARDS.approve) throw badRequest("VALIDATION_ERROR", "Use the test card 4242 4242 4242 4242");
      method = `Visa ending ${digits.slice(-4)}`;
    } else {
      if (!input.bank) throw badRequest("VALIDATION_ERROR", "Choose your bank");
      method = `Instant EFT, ${input.bank}`;
    }
    const t: Rec = {
      id: newId("dep"),
      userId,
      kind: "deposit",
      amountZar: zar(input.amountZar),
      method,
      status: "processing",
      reference: reference("SIYA"),
      createdAt: nowIso(),
    };
    state.transfers[t.id] = t;
    save();
    try {
      const res = await accounts.topUp(userId, zarToSettle(input.amountZar));
      t.status = "completed";
      t.completedAt = nowIso();
      t.txHash = res.hash;
      t.explorerUrl = xrplExplorer.transactionUrl(res.hash);
    } catch (error) {
      t.status = "failed";
      t.failure = error instanceof Error ? error.message : "The payment didn't go through";
      save();
      throw error;
    }
    save();
    return view(t);
  }

  // Out to a bank account. The fan's wallet pays the bank wallet on the ledger, then a
  // simulated EFT goes to their account and clears shortly after.
  async cashOut(userId: string, input: { amountZar: number; bank: string; accountNumber: string }): Promise<BankTransfer> {
    const wallet = accounts.walletFor(userId);
    if (!wallet) throw badRequest("INVALID_STATE", "Set up your wallet first");
    const digits = input.accountNumber.replace(/\D/g, "");
    if (digits.length < 6) throw badRequest("VALIDATION_ERROR", "Check the account number");
    const amount = zarToSettle(input.amountZar);
    const available = await spendable(wallet.address);
    if (Number(amount) > available + 1e-9) throw conflict("INVALID_STATE", "That's more than you can cash out right now");

    const res = await xrplClient.submitTx(wallet, {
      TransactionType: "Payment",
      Account: wallet.address,
      Destination: bankAddress(),
      Amount: settleAmount(amount),
    });
    if (res.result !== "tesSUCCESS") throw new ApiError(502, "LEDGER_ERROR", `Cash out didn't go through (${res.result})`);
    const t: Rec = {
      id: newId("out"),
      userId,
      kind: "cashout",
      amountZar: zar(input.amountZar),
      method: `${input.bank}, account ending ${digits.slice(-4)}`,
      status: "processing",
      reference: reference("SIYA"),
      createdAt: nowIso(),
      txHash: res.hash,
      explorerUrl: xrplExplorer.transactionUrl(res.hash),
    };
    state.transfers[t.id] = t;
    save();
    return view(t);
  }

  // A promoter payout leaves the platform wallet for the bank wallet on the ledger
  // before the (simulated) bank transfer goes to the promoter.
  async payoutToBank(amountZar: number): Promise<{ hash: string; reference: string }> {
    const res = await xrplPayments.promoterPay({ to: bankAddress(), amount: zarToSettle(amountZar), memo: { kind: "sale", reason: "promoter payout" } });
    if (res.result !== "tesSUCCESS") throw new ApiError(502, "LEDGER_ERROR", `Payout didn't go through on the ledger (${res.result})`);
    return { hash: res.hash, reference: reference("PAY") };
  }
}
