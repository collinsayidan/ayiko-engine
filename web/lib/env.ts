/**
 * Supabase settings. Set these in Vercel → Settings → Environment Variables.
 * Supabase now calls the keys "publishable" (safe in the browser) and
 * "secret" (server only); the legacy anon / service_role names also work.
 */
export const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  secretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  bucket: process.env.SUPABASE_BUCKET ?? "media",
};

/** Browser-safe values only (NEXT_PUBLIC_*). */
export const publicEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

export const authConfigured = () => Boolean(publicEnv.url && publicEnv.publishableKey);
export const serverConfigured = () => Boolean(env.url && env.secretKey && env.publishableKey);
