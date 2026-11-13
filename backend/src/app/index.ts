// Must be first: loads the repo-root .env before shared/config reads process.env.
import "../lib/env";

import express from "express";
import helmet from "helmet";
import cors from "cors";
import os from "os";
import apiRoutes from "./api/api-routes/route";
import { Drop } from "../application-logic/drop-logic/Drop";
import { Sales } from "../application-logic/sale-logic/Sales";
import { xrplConfig } from "../xrpl/xrpl.config";
import { identify } from "../middleware/auth";
import { initStore } from "../lib/store";
import { accounts } from "../application-logic/account-logic/Accounts";
import { supabaseConfigured } from "../lib/supabase";
import { alerts } from "../application-logic/alert-logic/Alerts";
import { Payouts } from "../application-logic/payout-logic/Payouts";

// server instance of the app
const app = express();

app.use(helmet());
// CORS_ORIGIN: comma-separated list of web app origins (Vercel URL). Open when unset.
const origins = (process.env.CORS_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors(origins.length ? { origin: origins } : undefined));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

// Request logger middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  res.on("finish", () => {
    console.log(`[${timestamp}] ${req.method} ${req.url} - Status: ${res.statusCode}`);
  });
  next();
});

// Works out who is calling (signed-in user, agent, admin key) on every request.
app.use(identify);

// mount all api routes here
app.use("/api", apiRoutes);
app.get("/", (_req, res) => {
  res.json({ success: true, data: { service: "Siyangena backend", accounts: supabaseConfigured() } });
});

const port = Number(process.env.PORT_NUMBER || process.env.PORT || 4000);

// Function to get LAN IP
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]!) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

async function boot() {
  await initStore();
  await accounts.init();
  new Drop().seedFromEnv();
  alerts.start();
  new Payouts().start();
}

boot()
  .catch((error) => {
    console.error("Startup failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .then(() => app.listen(port, () => {
  const localIp = getLocalIp();
  console.log(`Siyangena backend on ${xrplConfig.network} (settles in ${xrplConfig.settleAsset}):`);
  console.log(`  Localhost: http://localhost:${port}/api`);
  console.log(`  LAN IP: http://${localIp}:${port}/api`);
  console.log(`  Accounts: ${supabaseConfigured() ? "Supabase" : "off (local demo mode, data.json)"}`);

  // Start the primary-sale watcher without blocking the API if XRPL is unreachable.
  new Sales().startWatcher().catch((error) => {
    console.error("Sale watcher failed to start:", error instanceof Error ? error.message : error);
  });
}));
