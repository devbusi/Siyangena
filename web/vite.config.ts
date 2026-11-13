import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the built app also works when hosted from a sub-path or opened as a preview.
// VITE_XRPL_NETWORK and VITE_SETTLE_ASSET must match the backend's XRPL_NETWORK and SETTLE_ASSET
// so rand amounts convert the same way.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    base: "./",
    plugins: [react()],
    define: {
      "process.env": {
        XRPL_NETWORK: env.VITE_XRPL_NETWORK || "testnet",
        SETTLE_ASSET: env.VITE_SETTLE_ASSET || "",
      },
    },
    server: { port: 5173 },
  };
});
