// Fan agent runner. Claude decides; the MCP tools act; the promoter service and the ledger
// enforce the limits. Without ANTHROPIC_API_KEY (or with --policy) a rule-based policy runs instead.
//
//   npm run agent -- --fan thandi --goal buy
//   npm run agent -- --fan sipho --goal resale
//   npm run agent -- --fan thandi --goal sell --price 1250
//   npm run agent -- --fan thandi --watch      (keep signing as seller)
import "./env";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as tools from "./tools";
import { closeLedger } from "./wallet";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name: string) => args.includes(`--${name}`);

const fanId = (flag("fan") || process.env.AGENT_FAN || "thandi").toLowerCase();
const goal = flag("goal") || "buy";
const price = Number(flag("price") || 0);
const usePolicy = has("policy") || !process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.AGENT_MODEL || "claude-sonnet-5-5";

const say = (who: string, text: string) => console.log(`\n[${fanId} ${who}] ${text}`);

const GOALS: Record<string, string> = {
  buy: "Tickets for the event are about to go on sale. Read your mandate, wait for sales to open, then buy the number of tickets your mandate allows, only if the price fits.",
  resale: "You missed the sale. Check the resale listings and buy one ticket only if the total the buyer pays fits your mandate. If nothing fits, decline and explain why.",
  sell: `Your human can't go. List one ticket for resale at R${price || 1250}, then sign the swap as soon as a buyer accepts.`,
};

const SYSTEM = `You are ${fanId}'s ticket agent on Siyangena, a ticketing platform on the XRP Ledger.
You act on your own: nobody approves your individual actions.
Rules:
- Always read your mandate first. Never try to go over it: the promoter service and the ledger will block you anyway.
- Every buy or sell needs a one-sentence reason, written for your human.
- Prices are in rand. A resale costs the buyer the price plus the promoter's fee; compare that total to the mandate ceiling.
- When you are done, reply with a short summary for your human starting with DONE.`;

async function runWithClaude() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [require.resolve("tsx/cli"), path.resolve(__dirname, "mcp-server.ts")],
    env: { ...(process.env as Record<string, string>), AGENT_FAN: fanId },
    stderr: "inherit",
  });
  const mcp = new Client({ name: "siyangena-runner", version: "0.1.0" });
  await mcp.connect(transport);
  const listed = await mcp.listTools();
  say("agent", `connected to MCP server with ${listed.tools.length} tools, model ${MODEL}`);

  const anthropic = new Anthropic();
  const claudeTools = listed.tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as any,
  }));
  const messages: any[] = [{ role: "user", content: GOALS[goal] ?? goal }];

  for (let turn = 0; turn < 16; turn++) {
    const reply: any = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      tools: claudeTools,
      messages,
    });
    messages.push({ role: "assistant", content: reply.content });

    const results: any[] = [];
    for (const block of reply.content) {
      if (block.type === "text" && block.text.trim()) say("thinks", block.text.trim());
      if (block.type === "tool_use") {
        say("tool", `${block.name} ${JSON.stringify(block.input)}`);
        const out: any = await mcp.callTool({ name: block.name, arguments: block.input });
        const text = (out.content ?? []).map((c: any) => c.text ?? "").join("\n");
        say("result", text.length > 600 ? text.slice(0, 600) + " …" : text);
        results.push({ type: "tool_result", tool_use_id: block.id, content: text, is_error: Boolean(out.isError) });
      }
    }
    if (results.length === 0) break;
    messages.push({ role: "user", content: results });
  }
  await mcp.close();
}

// Rule-based fallback: same tools, same limits, no model.
async function runPolicy() {
  say("agent", "running the rule-based policy (no model)");
  const mandate: any = await tools.getMandate(fanId);
  if (!mandate.ok) return say("result", `No mandate: ${mandate.message}`);
  const m = mandate.data;
  say("mandate", `${m.quantity} ticket(s), max R${m.ceilingZar} each, bought ${m.bought}`);

  if (goal === "buy") {
    const status: any = await tools.waitForSalesOpen(300);
    say("status", JSON.stringify(status));
    if (Number(status.priceZar) > Number(m.ceilingZar)) return say("decision", "Price is over the ceiling, not buying.");
    const want = Math.min(m.quantity - m.bought, status.ticketsLeft ?? 0);
    if (want < 1) return say("decision", "Nothing to buy.");
    say("result", JSON.stringify(await tools.buyTicket(fanId, want, `Sales opened at R${status.priceZar}, within the R${m.ceilingZar} ceiling.`)));
  } else if (goal === "resale") {
    const listings: any = await tools.browseResale();
    const fit = (listings.open ?? []).find((l: any) => Number(l.totalZar) <= Number(m.ceilingZar));
    for (const l of listings.open ?? []) {
      if (Number(l.totalZar) > Number(m.ceilingZar)) say("decision", `Declined ${l.listingId}: R${l.totalZar} all-in is over the R${m.ceilingZar} ceiling.`);
    }
    if (!fit) return say("decision", "No listing fits the mandate.");
    say("result", JSON.stringify(await tools.acceptResale(fanId, fit.listingId, `R${fit.totalZar} all-in fits the R${m.ceilingZar} ceiling.`)));
  } else if (goal === "sell") {
    say("result", JSON.stringify(await tools.listForResale(fanId, price || 1250, "My human can't go.")));
  }
}

// Seller side runs alongside: sign any accepted swap on this fan's listings.
async function watchAsSeller(seconds: number) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    const res: any = await tools.signMyResales(fanId);
    for (const s of res.signed ?? []) say("signed", JSON.stringify(s));
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function main() {
  if (!has("watch")) {
    if (usePolicy) await runPolicy();
    else await runWithClaude();
  }
  if (goal === "sell" || has("watch")) {
    say("agent", "watching my listings so I can sign when a buyer accepts");
    await watchAsSeller(Number(flag("watch-seconds") || 180));
  }
  await closeLedger();
}

main().catch(async (error) => {
  console.error(error);
  await closeLedger();
  process.exit(1);
});
