/**
 * Where to send someone after they sign in. Only paths on this site are
 * allowed: "/app?plan=creator" is kept, but "//evil.com", "/\evil.com" and
 * anything else a browser would read as another host fall back to `fallback`.
 * No imports, so the engine's tests can check it.
 */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  const base = "https://ayiko.invalid";
  try {
    // Browsers drop tabs and newlines in URLs ("/\t/evil.com" is "//evil.com"), so check what they'd resolve.
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
