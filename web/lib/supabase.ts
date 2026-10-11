import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "./env";

/** Server-only client with the secret key. Bypasses RLS: never send it to the browser. Null until configured. */
export function supabaseAdmin(): SupabaseClient | null {
  if (!env.url || !env.secretKey) return null;
  return createClient(env.url, env.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The signed-in user's client, reading the session from cookies (server components and route handlers). */
export async function supabaseUser() {
  const store = await cookies();
  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a server component: the middleware refreshes the session instead.
        }
      },
    },
  });
}

/** The signed-in user, or null. Always verified with Supabase Auth, not just read from the cookie. */
export async function currentUser() {
  if (!env.url || !env.publishableKey) return null;
  const sb = await supabaseUser();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}
