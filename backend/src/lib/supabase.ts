import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase client with the service role key. It bypasses RLS, so it never
// leaves the backend. When SUPABASE_URL is not set the backend runs on data.json alone
// (local demo mode) and every account route answers 503.

let client: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function db(): SupabaseClient {
  if (!supabaseConfigured()) {
    throw new Error("Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
