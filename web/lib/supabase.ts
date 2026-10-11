import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Server-only Supabase client using the service role. Returns null until the keys are set in Vercel. */
export function supabaseServer(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
