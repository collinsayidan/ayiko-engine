"use client";

import { useState } from "react";
import { WAITLIST_LANGS, WAITLIST_ROLES } from "@/lib/content";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "done"; name: string } | { kind: "error"; message: string };

export function Waitlist({ language, setLanguage }: { language: string; setLanguage: (l: string) => void }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const email = String(f.get("email") ?? "").trim();
    if (!name) return setState({ kind: "error", message: "Add your name so we know who you are." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setState({ kind: "error", message: "Enter a valid email, like ama@example.com." });

    setState({ kind: "sending" });
    try {
      const idea = (document.getElementById("ask-text") as HTMLTextAreaElement | null)?.value ?? "";
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, language, role: f.get("role"), idea, website: f.get("website") }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "We couldn't save that. Try again in a moment.");
      setState({ kind: "done", name });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "We couldn't save that. Try again in a moment." });
    }
  }

  if (state.kind === "done") {
    return (
      <div className="done">
        <div className="check" aria-hidden="true">✓</div>
        <h3>You&apos;re on the list, {state.name.split(" ")[0]}</h3>
        <p>We&apos;ll email you when the private beta opens. Ayekoo!</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="fields">
        <div className="field">
          <label htmlFor="wl-name">Name</label>
          <input id="wl-name" name="name" autoComplete="name" placeholder="Ama Mensah" required maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="wl-email">Email</label>
          <input id="wl-email" name="email" type="email" autoComplete="email" placeholder="ama@example.com" required maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor="wl-lang">Main language for your videos</label>
          <select id="wl-lang" name="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {WAITLIST_LANGS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="wl-role">I am a</label>
          <select id="wl-role" name="role" defaultValue={WAITLIST_ROLES[0]}>
            {WAITLIST_ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        {/* Spam trap: people never see or fill this */}
        <input className="sr-only" tabIndex={-1} autoComplete="off" name="website" aria-hidden="true" />
      </div>
      <div className="form-foot">
        <button className="btn" type="submit" disabled={state.kind === "sending"}>
          {state.kind === "sending" ? "Joining…" : "Join the waitlist"}
        </button>
        <span className="err" role="alert">{state.kind === "error" ? state.message : ""}</span>
      </div>
    </form>
  );
}
