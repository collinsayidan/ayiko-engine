"use client";

import { useState } from "react";
import { LogoMark } from "../Icons";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Plan } from "@/lib/content";

export function LoginForm({ next, linkError, configured, plan }: { next: string; linkError: boolean; configured: boolean; plan: Plan | null }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "google">("idle");
  const [error, setError] = useState(linkError ? "That sign-in link has expired or was already used. Send a new one." : "");

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    setError("");
    setState("google");
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (error) { setState("idle"); setError("Google sign-in isn't available right now. Use your email instead."); }
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setError("Enter a valid email, like ama@example.com."); return; }
    setError("");
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: value, options: { emailRedirectTo: redirectTo() } });
    if (error) {
      setState("idle");
      setError(error.status === 429 ? "Too many attempts. Wait a minute and try again." : "We couldn't send the link. Check the address and try again.");
      return;
    }
    setState("sent");
  }

  return (
    <main className="auth">
      <a className="logo" href="/" aria-label="Ayiko home"><LogoMark /><span>ayiko<em>.ai</em></span></a>
      <div className="auth-card">
        {state === "sent" ? (
          <>
            <h1>Check your email</h1>
            <p className="muted">We sent a sign-in link to <b>{email.trim()}</b>. Open it on this device to continue. It can take a minute, so check spam too.</p>
            <button className="linkish" type="button" onClick={() => setState("idle")}>Use a different email</button>
          </>
        ) : (
          <>
            <h1>{plan && plan.id !== "free" ? "Create your account" : "Start making videos"}</h1>
            {plan && (
              <div className="picked">
                <div><small>Selected plan</small><b>{plan.name}</b><span>{plan.price} {plan.period} · {plan.credits}</span></div>
                <a href="/#pricing">Change</a>
              </div>
            )}
            <p className="muted">New accounts get <b>20 free credits</b>, enough for your first video{plan && plan.id !== "free" ? ". We'll save your plan choice too." : "."}</p>
            {!configured && <p className="err" role="alert">Sign-in isn&apos;t connected yet. Add the Supabase keys in Vercel.</p>}
            <button className="btn google" type="button" onClick={google} disabled={!configured || state !== "idle"}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z"/></svg>
              {state === "google" ? "Opening Google…" : "Continue with Google"}
            </button>
            <div className="or"><span>or</span></div>
            <form onSubmit={sendLink} noValidate className="plain">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" placeholder="ama@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!configured} />
              <button className="btn wide" type="submit" disabled={!configured || state !== "idle"}>{state === "sending" ? "Sending…" : "Email me a sign-in link"}</button>
            </form>
            <p className="err" role="alert">{error}</p>
            <p className="fineprint">By continuing you agree to use Ayiko only for content you have the rights to.</p>
          </>
        )}
      </div>
    </main>
  );
}
