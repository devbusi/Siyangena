// VITE_MOCK=1 runs the whole app on simulated data (for previews and design review).
export const MOCK = import.meta.env.VITE_MOCK === "1";
export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(/\/$/, "");
// Human-only routes (promoter controls, mandates). Agents never get this key.
export const HUMAN_KEY = import.meta.env.VITE_HUMAN_API_KEY || "";
