import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { conflict } from "../../lib/utils/errors";
import { Events } from "../event-logic/Events";
import { Fans } from "../fan-logic/Fans";

const events = new Events();
const fanService = new Fans();
const running = new Map<string, ChildProcess>();

// Starts a fan's agent as its own process (agent/src/runner.ts), the same as running
// `npm run agent` by hand. The child never gets HUMAN_API_KEY, so it can't change limits.
export class AgentRuns {
  start(fanId: string, goal: "buy" | "resale" | "sell", priceZar?: number) {
    fanService.getContext(fanId);
    if (running.has(fanId)) throw conflict("INVALID_STATE", `${fanId}'s agent is already running`);

    const repoRoot = path.resolve(__dirname, "../../../..");
    const args = [require.resolve("tsx/cli"), path.join(repoRoot, "agent/src/runner.ts"), "--fan", fanId, "--goal", goal];
    if (priceZar) args.push("--price", String(priceZar));

    const env = { ...process.env };
    delete env.HUMAN_API_KEY;
    const child = spawn(process.execPath, args, { cwd: repoRoot, env, stdio: ["ignore", "pipe", "pipe"] });
    running.set(fanId, child);

    const relay = (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) if (line.trim()) console.log(`[agent ${fanId}] ${line}`);
    };
    child.stdout?.on("data", relay);
    child.stderr?.on("data", relay);
    child.on("exit", (code) => {
      running.delete(fanId);
      events.emit("agent.action", `${fanId}'s agent finished (${code})`, {
        fanId,
        tool: "run",
        detail: code === 0 ? "Finished. Nothing else to do." : "Stopped with an error. Check the backend log.",
      });
    });

    const detail =
      goal === "buy"
        ? "Armed. Watching for tickets to go on sale."
        : goal === "resale"
          ? "Checking resale listings from verified fans."
          : `Listing a ticket for resale at R${priceZar ?? 1250}.`;
    events.emit("agent.action", `${fanId}'s agent started: ${goal}`, { fanId, tool: "run", detail });
    return { fanId, goal, running: true };
  }

  isRunning(fanId: string) {
    return running.has(fanId);
  }
}
