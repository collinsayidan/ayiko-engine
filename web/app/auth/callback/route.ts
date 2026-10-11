import { NextResponse } from "next/server";
import { supabaseUser } from "@/lib/supabase";

export const runtime = "nodejs";

/** Google and email-link sign-ins land here with a one-time code. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    const sb = await supabaseUser();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}

/** Only allow redirects within this site. */
function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/app";
}
