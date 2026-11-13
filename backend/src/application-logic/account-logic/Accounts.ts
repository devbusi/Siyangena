import { Wallet } from "xrpl";
import type { AdminUser, ApplicationStatus, Me, PromoterApplication, Role } from "@drop/shared";
import { RLUSD_CURRENCY_HEX } from "@drop/shared";
import { db, supabaseConfigured } from "../../lib/supabase";
import { decryptSecret, encryptSecret } from "../../lib/crypto";
import { ApiError, badRequest, forbidden } from "../../lib/utils/errors";
import { xrplClient } from "../../xrpl/xrpl.client";
import { xrplConfig } from "../../xrpl/xrpl.config";
import { settleAmount } from "../../xrpl/xrpl.amounts";

// Real accounts from Supabase. Each account gets one ticket wallet on Testnet (or Devnet),
// created by the server. It holds the fan's credential, tickets and spending money,
// and the fan never sees a seed. Seeds are stored encrypted in the wallets table.

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: Role;
  verified: boolean;
  walletAddress?: string;
  createdAt?: string;
}

const profiles = new Map<string, Profile>();
const wallets = new Map<string, Wallet>(); // userId -> wallet
const byAddress = new Map<string, string>(); // address -> userId
const creating = new Map<string, Promise<Wallet>>();

function toProfile(r: any): Profile {
  return {
    id: r.id,
    email: r.email ?? "",
    fullName: r.full_name ?? "",
    phone: r.phone ?? undefined,
    role: r.role,
    verified: Boolean(r.verified),
    walletAddress: r.wallet_address ?? undefined,
    createdAt: r.created_at,
  };
}

function toApplication(r: any, email?: string): PromoterApplication {
  return {
    userId: r.user_id,
    kind: r.kind,
    displayName: r.display_name,
    registrationNumber: r.registration_number ?? undefined,
    pastEvents: r.past_events ?? undefined,
    socials: r.socials ?? undefined,
    payoutDetails: r.payout_details ?? undefined,
    status: r.status,
    reviewNote: r.review_note ?? undefined,
    reviewedAt: r.reviewed_at ?? undefined,
    createdAt: r.created_at,
    ...(email ? { email } : {}),
  };
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new ApiError(502, "INTERNAL_ERROR", `${what}: ${res.error.message}`);
  return res.data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Accounts {
  // Load every wallet into memory at boot, so lookups by fan id and address stay synchronous.
  async init() {
    if (!supabaseConfigured()) return;
    const rows = check(await db().from("wallets").select("user_id,address,seed_encrypted"), "Load wallets") ?? [];
    for (const r of rows as any[]) {
      try {
        const wallet = Wallet.fromSeed(decryptSecret(r.seed_encrypted));
        wallets.set(r.user_id, wallet);
        byAddress.set(wallet.address, r.user_id);
      } catch (error) {
        console.error(`Could not decrypt wallet for ${r.user_id}:`, error instanceof Error ? error.message : error);
      }
    }
    const people = check(await db().from("profiles").select("*"), "Load profiles") ?? [];
    for (const r of people as any[]) profiles.set(r.id, toProfile(r));
    console.log(`Loaded ${wallets.size} account wallet(s) and ${profiles.size} profile(s)`);
  }

  // Everyone with a ticket wallet (for refunds when an event is cancelled).
  userIds(): string[] {
    return [...wallets.keys()];
  }

  walletFor(userId: string): Wallet | null {
    return wallets.get(userId) ?? null;
  }

  userByAddress(address: string): string | null {
    return byAddress.get(address) ?? null;
  }

  cachedProfile(userId: string): Profile | null {
    return profiles.get(userId) ?? null;
  }

  async getProfile(userId: string): Promise<Profile> {
    const row = check(await db().from("profiles").select("*").eq("id", userId).maybeSingle(), "Load profile");
    if (!row) throw new ApiError(404, "NOT_FOUND", "No profile for this account yet");
    const profile = toProfile(row);
    profiles.set(userId, profile);
    return profile;
  }

  // The sign-up trigger normally makes the profile. This covers accounts made before it ran.
  async ensureProfile(user: { id: string; email?: string; fullName?: string; role?: string; phone?: string }): Promise<Profile> {
    const existing = check(await db().from("profiles").select("*").eq("id", user.id).maybeSingle(), "Load profile");
    if (existing) {
      const profile = toProfile(existing);
      profiles.set(user.id, profile);
      return profile;
    }
    const role = user.role === "promoter" ? "promoter" : "fan";
    const row = check(
      await db()
        .from("profiles")
        .insert({ id: user.id, email: user.email ?? null, full_name: user.fullName ?? null, phone: user.phone ?? null, role })
        .select("*")
        .single(),
      "Create profile",
    );
    const profile = toProfile(row);
    profiles.set(user.id, profile);
    return profile;
  }

  async setVerified(userId: string, verified: boolean) {
    check(await db().from("profiles").update({ verified }).eq("id", userId), "Update profile");
    const p = profiles.get(userId);
    if (p) p.verified = verified;
  }

  // Creates and funds the account's wallet the first time. Safe to call again.
  async ensureWallet(userId: string): Promise<Wallet> {
    const known = wallets.get(userId);
    if (known) return known;
    const inFlight = creating.get(userId);
    if (inFlight) return inFlight;

    const job = (async () => {
      const row = check(await db().from("wallets").select("seed_encrypted").eq("user_id", userId).maybeSingle(), "Load wallet");
      if (row) {
        const wallet = Wallet.fromSeed(decryptSecret((row as any).seed_encrypted));
        wallets.set(userId, wallet);
        byAddress.set(wallet.address, userId);
        return wallet;
      }

      const client = await xrplClient.ensureConnected();
      const { wallet } = await client.fundWallet();
      // Testnet settles in RLUSD, so the wallet needs a trust line before it can hold any.
      if (xrplConfig.settleAsset === "RLUSD") {
        const trust = await xrplClient.submitTx(wallet, {
          TransactionType: "TrustSet",
          Account: wallet.address,
          LimitAmount: { currency: RLUSD_CURRENCY_HEX, issuer: xrplConfig.rlusdIssuer, value: "1000000000" },
        });
        if (trust.result !== "tesSUCCESS") throw new Error(`TrustSet failed: ${trust.result}`);
      }

      check(
        await db().from("wallets").insert({
          user_id: userId,
          address: wallet.address,
          seed_encrypted: encryptSecret(wallet.seed!),
          network: xrplConfig.network,
        }),
        "Save wallet",
      );
      check(await db().from("profiles").update({ wallet_address: wallet.address }).eq("id", userId), "Update profile");
      wallets.set(userId, wallet);
      byAddress.set(wallet.address, userId);
      const p = profiles.get(userId);
      if (p) p.walletAddress = wallet.address;
      return wallet;
    })().finally(() => creating.delete(userId));

    creating.set(userId, job);
    return job;
  }

  // Test money for Testnet: the demo bank wallet sends the account some spending money.
  async topUp(userId: string, amountSettle: string) {
    const bankSeed = process.env.BANK_SEED;
    if (!bankSeed) throw badRequest("INVALID_STATE", "Test money is off: BANK_SEED is not set on the server");
    const wallet = await this.ensureWallet(userId);
    const bank = Wallet.fromSeed(bankSeed);
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await xrplClient.submitTx(bank, {
        TransactionType: "Payment",
        Account: bank.address,
        Destination: wallet.address,
        Amount: settleAmount(amountSettle),
      });
      if (res.result === "tesSUCCESS") return res;
      if (attempt === 0 && res.result === "tecPATH_DRY") {
        await sleep(1500);
        continue;
      }
      if (res.result === "tecPATH_DRY" && xrplConfig.settleAsset === "RLUSD") {
        throw new ApiError(
          502,
          "LEDGER_ERROR",
          `The test bank has no RLUSD left. Claim test RLUSD at tryrlusd.com for ${bank.address}, then top up again.`,
        );
      }
      throw new ApiError(502, "LEDGER_ERROR", `Top-up failed: ${res.result}`);
    }
    throw new ApiError(502, "LEDGER_ERROR", "Top-up failed");
  }

  async me(userId: string): Promise<Me> {
    const profile = await this.getProfile(userId);
    const application = await this.getApplication(userId);
    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      ...(profile.phone ? { phone: profile.phone } : {}),
      role: profile.role,
      verified: profile.verified,
      walletReady: wallets.has(userId),
      ...(profile.walletAddress ? { walletAddress: profile.walletAddress } : {}),
      ...(application ? { application } : {}),
    };
  }

  // ---- Promoter applications ----

  async getApplication(userId: string): Promise<PromoterApplication | undefined> {
    const row = check(await db().from("promoter_applications").select("*").eq("user_id", userId).maybeSingle(), "Load application");
    return row ? toApplication(row) : undefined;
  }

  async submitApplication(
    userId: string,
    input: Omit<PromoterApplication, "userId" | "status" | "reviewNote" | "reviewedAt" | "createdAt" | "email">,
  ): Promise<PromoterApplication> {
    const existing = await this.getApplication(userId);
    if (existing?.status === "approved") return existing;
    const row = check(
      await db()
        .from("promoter_applications")
        .upsert({
          user_id: userId,
          kind: input.kind,
          display_name: input.displayName,
          registration_number: input.registrationNumber ?? null,
          past_events: input.pastEvents ?? null,
          socials: input.socials ?? null,
          payout_details: input.payoutDetails ?? null,
          status: "pending",
          review_note: null,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single(),
      "Save application",
    );
    return toApplication(row);
  }

  async assertApprovedPromoter(userId: string): Promise<PromoterApplication> {
    const application = await this.getApplication(userId);
    if (!application || application.status !== "approved") {
      throw forbidden("UNAUTHORIZED", "Your promoter account is still being reviewed");
    }
    return application;
  }

  // ---- Admin ----

  async listApplications(status?: ApplicationStatus): Promise<PromoterApplication[]> {
    let query = db().from("promoter_applications").select("*").order("created_at", { ascending: true });
    if (status) query = query.eq("status", status);
    const rows = (check(await query, "List applications") ?? []) as any[];
    return rows.map((r) => toApplication(r, profiles.get(r.user_id)?.email));
  }

  async reviewApplication(adminId: string, userId: string, decision: ApplicationStatus, note?: string) {
    const row = check(
      await db()
        .from("promoter_applications")
        .update({
          status: decision,
          review_note: note ?? null,
          reviewed_by: adminId === "admin-key" ? null : adminId,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select("*")
        .single(),
      "Review application",
    );
    if (decision === "approved") {
      const profile = await this.getProfile(userId);
      if (profile.role === "fan") await this.setRole(userId, "promoter");
    }
    return toApplication(row);
  }

  async listUsers(): Promise<AdminUser[]> {
    const rows = (check(await db().from("profiles").select("*").order("created_at", { ascending: false }), "List users") ?? []) as any[];
    return rows.map((r) => {
      const p = toProfile(r);
      profiles.set(p.id, p);
      return { id: p.id, email: p.email, fullName: p.fullName, phone: p.phone, role: p.role, verified: p.verified, createdAt: p.createdAt ?? "" };
    });
  }

  async setRole(userId: string, role: Role) {
    check(await db().from("profiles").update({ role }).eq("id", userId), "Set role");
    const p = profiles.get(userId);
    if (p) p.role = role;
  }
}

export const accounts = new Accounts();
