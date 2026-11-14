// MCP server (stdio) exposing one fan agent's actions as tools.
// Run: AGENT_FAN=thandi npm run mcp   (or plug it into Claude Desktop / Claude Code)
import "./env";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { toolCatalogue } from "./tools";

const fanId = (process.env.AGENT_FAN || "thandi").toLowerCase();
const server = new McpServer({ name: `siyangena-agent-${fanId}`, version: "0.1.0" });

for (const tool of toolCatalogue(fanId)) {
  server.registerTool(tool.name, { description: tool.description, inputSchema: tool.shape }, async (args: any) => {
    try {
      const result = await tool.run(args ?? {});
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
      };
    }
  });
}

server.connect(new StdioServerTransport()).catch((error) => {
  console.error("MCP server failed:", error);
  process.exit(1);
});
