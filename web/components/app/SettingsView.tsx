"use client";

import { useEffect, useState } from "react";
import { PageHead, useAccount } from "./Shell";

type Theme = "system" | "dark" | "light";

function readTheme(): Theme {
  try { const t = localStorage.getItem("ayiko-theme"); return t === "dark" || t === "light" ? t : "system"; } catch { return "system"; }
}
function applyTheme(t: Theme) {
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try { if (t === "system") localStorage.removeItem("ayiko-theme"); else localStorage.setItem("ayiko-theme", t); } catch { /* private window */ }
}

const PROVIDER: Record<string, string> = { google: "Google", email: "Email link" };

export function SettingsView() {
  const { account, setAccount, toast } = useAccount();
  const [name, setName] = useState(account.name);
  const [savingName, setSavingName] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState("");
  useEffect(() => setTheme(readTheme()), []);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    const res = await fetch("/api/account", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setSavingName(false);
    if (!res?.ok) { toast(body?.error ?? "We couldn't save that. Try again."); return; }
    setAccount({ name: body.name });
    toast("Name saved.");
  }

  async function toggleEmails() {
    const next = !account.emailUpdates;
    setAccount({ emailUpdates: next });
    const res = await fetch("/api/preferences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ emailUpdates: next }) }).catch(() => null);
    if (!res?.ok) { setAccount({ emailUpdates: !next }); toast("We couldn't save that. Try again."); }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDelError("");
    const res = await fetch("/api/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm }) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (res?.ok) { window.location.href = "/"; return; }
    setDeleting(false);
    setDelError(body?.error ?? "We couldn't delete your account. Try again.");
  }

  return (
    <>
      <PageHead title="Settings" />
      <div className="settings">
        <section className="panel">
          <h2>Profile</h2>
          <form className="row-form" onSubmit={saveName}>
            <div className="field grow"><label htmlFor="set-name">Name</label><input id="set-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ama Mensah" /></div>
            <button type="submit" className="btn ghost" disabled={savingName || !name.trim() || name === account.name}>{savingName ? "Saving…" : "Save"}</button>
          </form>
          <dl className="facts">
            <div><dt>Email</dt><dd>{account.email}</dd></div>
            <div><dt>Sign-in</dt><dd>{account.providers.map((p) => PROVIDER[p] ?? p).join(", ") || "Email link"}</dd></div>
          </dl>
        </section>

        <section className="panel">
          <h2>Notifications</h2>
          <label className="menu-switch"><input id="set-email" type="checkbox" checked={account.emailUpdates} onChange={() => void toggleEmails()} /><span>Email me when my videos are ready</span></label>
        </section>

        <section className="panel">
          <h2>Appearance</h2>
          <div className="seg narrow" role="radiogroup" aria-label="Theme">
            {(["system", "dark", "light"] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={theme === t} className={theme === t ? "on" : ""} onClick={() => { setTheme(t); applyTheme(t); }}>
                {t === "system" ? "Match device" : t === "dark" ? "Dark" : "Light"}
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Brand and billing</h2>
          <p className="muted">Your colours, captions and end card live in the <a href="/app/brand">brand kit</a>. Plans, invoices and credit history are under <a href="/app/billing">Billing</a>.</p>
        </section>

        <section className="panel danger-zone">
          <h2>Delete account</h2>
          <p className="muted">Deletes your videos, photos, credits and account. Unused credits are lost and this can&apos;t be undone. If you have a monthly plan, cancel it under Billing first.</p>
          <label htmlFor="set-del">Type <b>{account.email}</b> to confirm</label>
          <div className="row-form">
            <input id="set-del" className="grow" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            <button type="button" className="btn danger-btn" disabled={deleting || confirm.trim().toLowerCase() !== account.email.toLowerCase()} onClick={() => void deleteAccount()}>{deleting ? "Deleting…" : "Delete account"}</button>
          </div>
          <p className="err" role="alert">{delError}</p>
        </section>
      </div>
    </>
  );
}
