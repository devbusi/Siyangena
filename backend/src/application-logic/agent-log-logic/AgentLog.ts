import type { AgentLogEntry } from "@drop/shared";
import { state, save } from "../../lib/store";
import { newId, nowIso } from "../../lib/utils/ids";
import { xrplExplorer } from "../../xrpl/xrpl.explorer";
import { Events } from "../event-logic/Events";

const events = new Events();

// What the agent did and why, for the live view.
export class AgentLog {
  addEntry(params: { fanId: string; mandateId: string; tool: string; reason: string; txHash?: string }, eventId?: string): AgentLogEntry {
    const entry: AgentLogEntry = {
      id: newId("log"),
      at: nowIso(),
      ...params,
      ...(params.txHash ? { explorerUrl: xrplExplorer.transactionUrl(params.txHash) } : {}),
    };
    state.agentLog.push(entry);
    save();
    events.emit("agent.action", `${params.fanId}'s agent: ${params.tool}: ${params.reason}`, {
      fanId: params.fanId,
      ...(eventId ? { eventId } : {}),
      txHash: params.txHash,
      detail: params.reason,
      tool: params.tool,
    });
    return entry;
  }

  listEntries(fanId?: string): AgentLogEntry[] {
    return state.agentLog.filter((e) => !fanId || e.fanId === fanId);
  }
}
