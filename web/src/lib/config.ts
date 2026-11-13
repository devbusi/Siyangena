// VITE_MOCK=1 runs the whole app on simulated data (for previews and design review).
export const MOCK = import.meta.env.VITE_MOCK === "1";
export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(/\/$/, "");
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
// The publishable (anon) key is safe in the browser. Never put the secret key here.
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";
