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

// server instance of the app
const app = express();

app.use(helmet());
app.use(cors());
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

// mount all api routes here
app.use("/api", apiRoutes);

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

new Drop().seedFromEnv();

app.listen(port, () => {
  const localIp = getLocalIp();
  console.log(`Drop backend on ${xrplConfig.network} (settles in ${xrplConfig.settleAsset}):`);
  console.log(`  Localhost: http://localhost:${port}/api`);
  console.log(`  LAN IP: http://${localIp}:${port}/api`);

  // Start the primary-sale watcher without blocking the API if XRPL is unreachable.
  new Sales().startWatcher().catch((error) => {
    console.error("Sale watcher failed to start:", error instanceof Error ? error.message : error);
  });
});
