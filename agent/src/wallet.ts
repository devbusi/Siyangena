import { Client, Wallet } from "xrpl";
import { ACTIVE } from "@drop/shared";

// Each agent signs with its own agent wallet. That wallet holds the fan's allowance,
// so the ledger itself caps what the agent can spend.
const SEED_ENV: Record<string, string> = {
  thandi: "THANDI_AGENT_SEED",
  sipho: "SIPHO_AGENT_SEED",
  scalper: "SCALPER_AGENT_SEED",
};

export function agentWallet(fanId: string): Wallet {
  const envName = SEED_ENV[fanId];
  const seed = envName ? process.env[envName] : undefined;
  if (!seed) throw new Error(`No agent wallet for "${fanId}" (set ${envName ?? "a seed"} in .env, run npm run setup)`);
  return Wallet.fromSeed(seed);
}

let client: Client | null = null;

export async function ledger(): Promise<Client> {
  client ??= new Client(ACTIVE.wss);
  if (!client.isConnected()) await client.connect();
  return client;
}

export async function closeLedger() {
  if (client?.isConnected()) await client.disconnect();
}
