import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authLanding } from "@/lib/auth-landing";

/** Pages that need the Supabase session; every other path only gets the sign-in link check. */
const SESSION_PATHS = /^\/(?:$|app(?:\/|$)|admin$|login$|auth\/|api\/)/;

/** Keeps the Supabase session fresh and sends signed-out visitors from /app to /login. */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  // Sign-in links that land on the wrong page go to the right handler.
  const landing = authLanding(request.nextUrl.pathname, request.nextUrl.searchParams);
  if (landing) return NextResponse.redirect(new URL(landing, request.url));
  if (!SESSION_PATHS.test(request.nextUrl.pathname)) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user && request.nextUrl.pathname.startsWith("/app")) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  // Every page, so a sign-in link that lands anywhere is caught; not static files.
  matcher: ["/((?!_next/static|_next/image|fonts/|showcase/|icon.svg|robots.txt|sitemap.xml).*)"],
};
