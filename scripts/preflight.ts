// Amendment and version checks. Run: npm run preflight
import { execSync } from "child_process";
import { Client } from "xrpl";
import { NETWORKS, RLUSD_TESTNET_ISSUER } from "@drop/shared";

const WATCH = ["BatchV1_1", "fixBatchV1_2", "MPTokensV1", "Credentials"];

async function main() {
  for (const net of Object.values(NETWORKS)) {
    const client = new Client(net.wss);
    await client.connect();
    const info: any = await client.request({ command: "server_info" });
    const res: any = await client.request({ command: "feature" } as any);
    const features = Object.values(res.result.features) as any[];
    console.log(`\n${net.name} (build ${info.result.info.build_version})`);
    for (const want of WATCH) {
      const f = features.find((x) => x.name === want);
      console.log(`  ${want}: ${f ? (f.enabled ? "ENABLED" : "not enabled") : "unknown to this server"}`);
    }
    if (net.name === "testnet") {
      try {
        await client.request({ command: "account_info", account: RLUSD_TESTNET_ISSUER });
        console.log("  RLUSD issuer: found");
      } catch {
        console.log("  RLUSD issuer: NOT found");
      }
    }
    await client.disconnect();
  }
  console.log("\n" + execSync("npm ls xrpl", { encoding: "utf8" }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
