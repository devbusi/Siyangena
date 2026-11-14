import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MOCK, SUPABASE_KEY, SUPABASE_URL } from "./config";

// Browser client: sign-up, sign-in and the session token. Data goes through our backend.
export const supabase: SupabaseClient | null =
  !MOCK && SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
