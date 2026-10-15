import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { supabaseUser } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Email links that carry a token_hash (Supabase's newer email templates)
 * land here instead of /auth/callback. Both end with the user signed in.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;
  const next = safeNext(url.searchParams.get("next"));
  if (tokenHash) {
    const sb = await supabaseUser();
    const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
