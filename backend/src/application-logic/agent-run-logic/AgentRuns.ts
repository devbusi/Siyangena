import { spawn, type ChildProcess } from "child_process";
import crypto from "crypto";
import path from "path";
import { conflict } from "../../lib/utils/errors";
import { Events } from "../event-logic/Events";
import { Fans } from "../fan-logic/Fans";
import { Drop } from "../drop-logic/Drop";

const events = new Events();
const fanService = new Fans();
const dropService = new Drop();
const running = new Map<string, ChildProcess>();

// Agents call the backend with this key plus their fan id, so they can act for that fan
// only and never change the fan's limits. Made fresh at boot unless AGENT_API_KEY is set.
process.env.AGENT_API_KEY ||= crypto.randomBytes(24).toString("hex");

// Starts a fan's agent as its own process (agent/src/runner.ts), the same as running
// `npm run agent` by hand. The child never gets HUMAN_API_KEY or the Supabase keys.
export class AgentRuns {
  start(fanId: string, goal: "buy" | "resale" | "sell", priceZar?: number, eventId?: string) {
    const ctx = fanService.getContext(fanId);
    const drop = dropService.getRecord(eventId);
    const key = `${fanId}:${drop.id}`;
    if (running.has(key)) throw conflict("INVALID_STATE", "Your agent is already running for this event");

    const repoRoot = path.resolve(__dirname, "../../../..");
    const args = [require.resolve("tsx/cli"), path.join(repoRoot, "agent/src/runner.ts"), "--fan", fanId, "--goal", goal];
    if (priceZar) args.push("--price", String(priceZar));

    const env: Record<string, string | undefined> = { ...process.env };
    delete env.HUMAN_API_KEY;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    delete env.WALLET_ENCRYPTION_KEY;
    delete env.BANK_SEED;
    env.AGENT_FAN = fanId;
    env.AGENT_EVENT_ID = drop.id;
    env.BACKEND_URL ||= `http://127.0.0.1:${process.env.PORT_NUMBER || process.env.PORT || 4000}`;
    // Real accounts: hand the agent its own wallet only.
    if (ctx.custodial) env.AGENT_SEED = ctx.agent.seed;

    const child = spawn(process.execPath, args, { cwd: repoRoot, env, stdio: ["ignore", "pipe", "pipe"] });
    running.set(key, child);

    const relay = (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) if (line.trim()) console.log(`[agent ${fanId}] ${line}`);
    };
    child.stdout?.on("data", relay);
    child.stderr?.on("data", relay);
    child.on("exit", (code) => {
      running.delete(key);
      events.emit("agent.action", `${fanId}'s agent finished (${code})`, {
        fanId,
        eventId: drop.id,
        tool: "run",
        detail: code === 0 ? "Finished. Nothing else to do." : "Stopped with an error. Check the backend log.",
      });
    });

    const detail =
      goal === "buy"
        ? "Armed. Watching for tickets to go on sale."
        : goal === "resale"
          ? "Checking resale listings from verified ticket holders."
          : `Listing a ticket for resale at R${priceZar ?? 1250}.`;
    events.emit("agent.action", `${fanId}'s agent started: ${goal}`, { fanId, eventId: drop.id, tool: "run", detail });
    return { fanId, eventId: drop.id, goal, running: true };
  }

  isRunning(fanId: string, eventId?: string) {
    if (eventId) return running.has(`${fanId}:${eventId}`);
    return [...running.keys()].some((k) => k.startsWith(`${fanId}:`));
  }
}
