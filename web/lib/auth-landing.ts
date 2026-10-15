/**
 * Sign-in links sometimes land on the wrong page with their one-time code
 * attached: Supabase falls back to the Site URL when a redirect isn't on its
 * allow list, and a Site URL or email template with a path (e.g.
 * "/auth/v1/callback") sends people to a page that doesn't exist. Returns
 * where such a request should go instead, or null to leave it alone.
 * No imports, so the engine's tests can check it.
 */
export function authLanding(pathname: string, params: URLSearchParams): string | null {
  if (pathname === "/auth/callback" || pathname === "/auth/confirm" || pathname.startsWith("/api/")) return null;
  const to = params.has("token_hash") ? "/auth/confirm" : params.has("code") ? "/auth/callback" : null;
  if (to) {
    const q = new URLSearchParams(params);
    if (!q.has("next")) q.set("next", "/app");
    return `${to}?${q}`;
  }
  // Expired or already-used links come back as ?error=…&error_code=otp_expired.
  if (params.has("error_code") || params.has("error_description")) return "/login?error=link";
  return null;
}
