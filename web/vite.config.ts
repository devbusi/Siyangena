import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the built app also works when hosted from a sub-path or opened as a preview.
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { "process.env": {} },
  server: { port: 5173 },
});
