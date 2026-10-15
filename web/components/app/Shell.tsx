"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogoMark } from "../Icons";
import { Icon, type IconName } from "./icons";
import { PLANS, planById } from "@/lib/content";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Account } from "@/lib/account";
import type { BrandKit } from "@/lib/brand";

interface Toast { text: string; action?: { label: string; href: string } }
interface Ctx {
  account: Account;
  subscribed: boolean;
  setBalance: (n: number) => void;
  setBrand: (b: BrandKit) => void;
  setAccount: (patch: Partial<Account>) => void;
  toast: (text: string, action?: Toast["action"]) => void;
  openPlans: () => void;
  manageBilling: () => Promise<void>;
}

const AccountContext = createContext<Ctx | null>(null);
export function useAccount() {
  const c = useContext(AccountContext);
  if (!c) throw new Error("useAccount must be used inside <Shell>");
  return c;
}

const NAV: { href: string; label: string; icon: IconName; mobile?: boolean }[] = [
  { href: "/app", label: "Create", icon: "plus", mobile: true },
  { href: "/app/videos", label: "My videos", icon: "film", mobile: true },
  { href: "/app/templates", label: "Templates", icon: "layout", mobile: true },
  { href: "/app/brand", label: "Brand kit", icon: "palette" },
  { href: "/app/billing", label: "Billing", icon: "card", mobile: true },
  { href: "/app/settings", label: "Settings", icon: "settings", mobile: true },
];

/** Credits the account is "sized" for, so the meter has something to fill against. */
function allowance(account: Account, subscribed: boolean) {
  const plan = planById(subscribed ? account.billing.plan : null);
  const n = plan ? Number.parseInt(plan.credits, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.max(n, account.balance) : Math.max(20, account.balance);
}

export function Shell({ initial, children }: { initial: Account; children: React.ReactNode }) {
  const [account, setAccountState] = useState<Account>(initial);
  const subscribed = ["active", "trialing", "past_due"].includes(account.billing.status);
  const plan = planById(subscribed ? account.billing.plan : null);
  const pathname = usePathname() ?? "/app";
  const [toast, setToastState] = useState<Toast | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [payError, setPayError] = useState("");
  const [noted, setNoted] = useState<string | null>(null);
  const plansRef = useRef<HTMLDialogElement>(null);

  const setAccount = useCallback((patch: Partial<Account>) => setAccountState((a) => ({ ...a, ...patch })), []);
  const toastFn = useCallback((text: string, action?: Toast["action"]) => setToastState({ text, action }), []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToastState(null), 6000); return () => clearTimeout(t); }, [toast]);

  const manageBilling = useCallback(async () => {
    const res = await fetch("/api/billing-portal", { method: "POST" }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (res?.ok && body?.url) window.location.href = body.url;
    else toastFn(body?.error ?? "We couldn't open billing. Try again.");
  }, [toastFn]);

  async function checkout(planId: string) {
    setPaying(planId);
    setPayError("");
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: planId }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) { window.location.href = body.url; return; }
      if (body.manage) { await manageBilling(); return; }
      setPayError(body.error ?? "We couldn't open the payment page. Try again.");
    } catch {
      setPayError("Check your connection and try again.");
    }
    setPaying(null);
  }

  useEffect(() => {
    const d = plansRef.current;
    if (!d) return;
    if (showPlans && !d.open) d.showModal();
    if (!showPlans && d.open) d.close();
  }, [showPlans]);

  // Query flags that can land on any app page: a plan picked on the pricing page, or a return from Stripe.
  useEffect(() => {
    const url = new URL(window.location.href);
    const picked = planById(url.searchParams.get("plan"));
    const checkoutState = url.searchParams.get("checkout");
    if (!picked && !checkoutState) return;
    ["plan", "checkout", "plan_paid"].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState(null, "", url.pathname + url.search);
    if (picked && picked.id !== "free") {
      setNoted(picked.id);
      try {
        void supabaseBrowser().auth.updateUser({ data: { selected_plan: picked.id, selected_plan_at: new Date().toISOString() } }).catch(() => {});
      } catch { /* saving the choice is a nice-to-have */ }
    }
    if (checkoutState !== "success") return;
    setNoted(null);
    toastFn("Payment received, thank you! Your credits will appear in a few seconds.");
    // Credits arrive by webhook a few seconds later, so check a few times.
    const timers = [2000, 5000, 9000, 15000].map((ms) => setTimeout(async () => {
      const res = await fetch("/api/videos", { cache: "no-store" }).catch(() => null);
      if (res?.ok) { const b = await res.json(); setAccount({ balance: b.balance }); }
    }, ms));
    return () => timers.forEach(clearTimeout);
  }, [toastFn, setAccount]);

  const setBalance = useCallback((balance: number) => setAccount({ balance }), [setAccount]);
  const setBrand = useCallback((brand: BrandKit) => setAccount({ brand }), [setAccount]);
  const openPlans = useCallback(() => setShowPlans(true), []);
  const ctx = useMemo<Ctx>(() => ({ account, subscribed, setBalance, setBrand, setAccount, toast: toastFn, openPlans, manageBilling }),
    [account, subscribed, setBalance, setBrand, setAccount, toastFn, openPlans, manageBilling]);

  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));
  const initials = (account.name || account.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("") || "A";
  const cap = allowance(account, subscribed);
  const notedPlan = planById(noted);

  return (
    <AccountContext.Provider value={ctx}>
      <div className="shell">
        <aside className="side" aria-label="Main">
          <a className="logo" href="/app" aria-label="Ayiko studio"><LogoMark /><span>ayiko<em>.ai</em></span></a>
          <nav className="side-nav">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={isActive(n.href) ? "on" : ""} aria-current={isActive(n.href) ? "page" : undefined}>
                <Icon name={n.icon} />{n.label}
              </a>
            ))}
          </nav>
          <div className="side-foot">
            <div className="meter" aria-label={`${account.balance} credits left`}>
              <div className="meter-row"><span>Credits</span><b>{account.balance}</b></div>
              <div className="meter-bar"><i style={{ width: `${Math.min(100, (account.balance / cap) * 100)}%` }} /></div>
              <small>{plan ? `${plan.name} plan` : "Free trial"}{subscribed && account.billing.renewsAt ? ` · ${account.billing.cancelAtPeriodEnd ? "ends" : "renews"} ${new Date(account.billing.renewsAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}</small>
            </div>
            {account.billing.enabled && (
              <button type="button" className="btn upgrade" onClick={() => setShowPlans(true)}><Icon name="bolt" size={16} />{subscribed ? "Buy credits" : "Upgrade"}</button>
            )}
          </div>
        </aside>

        <div className="main">
          <header className="appbar">
            <a className="logo appbar-logo" href="/app" aria-label="Ayiko studio"><LogoMark /><span>ayiko<em>.ai</em></span></a>
            <div className="appbar-right">
              <a className="credits" href="/app/billing" aria-label={`${account.balance} credits. Open billing`}><b>{account.balance}</b> credits</a>
              {account.billing.enabled && <button type="button" className="btn buy" onClick={() => setShowPlans(true)}>{subscribed ? "Buy credits" : "Upgrade"}</button>}
              <details className="menu">
                <summary aria-label="Account menu">{account.avatar ? <img src={account.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{initials}</span>}</summary>
                <div className="menu-pop">
                  <p><b>{account.name || "Your account"}</b><br /><small>{account.email}</small></p>
                  <a href="/app/settings"><Icon name="settings" size={16} />Settings</a>
                  <a href="/app/brand"><Icon name="palette" size={16} />Brand kit</a>
                  <a href="/app/billing"><Icon name="card" size={16} />Billing and usage</a>
                  <form action="/auth/signout" method="post"><button type="submit"><Icon name="logout" size={16} />Log out</button></form>
                </div>
              </details>
            </div>
          </header>

          {notedPlan && (
            <div className="banner plan-banner" role="status">
              <div>
                <b>You chose {notedPlan.name}: {notedPlan.price} {notedPlan.period}, {notedPlan.credits}.</b>
                {account.billing.enabled
                  ? <span> Pay securely with Stripe and the credits are added straight away.</span>
                  : <span> Card payment opens very soon. We&apos;ve saved your choice and will let you know the moment you can upgrade. Until then, make videos with your free credits.</span>}
              </div>
              <div className="banner-actions">
                {account.billing.enabled && <button type="button" className="btn" disabled={paying !== null} onClick={() => void checkout(notedPlan.id)}>{paying === notedPlan.id ? "Opening…" : "Continue to payment"}</button>}
                <button type="button" className="linkish" onClick={() => setNoted(null)}>{account.billing.enabled ? "Not now" : "OK"}</button>
              </div>
            </div>
          )}
          {!account.status.languages.length && (
            <p className="banner">Voices are being set up right now. You can look around; generating opens as soon as the studio is ready.</p>
          )}
          {account.status.languages.length > 0 && !account.status.online && (
            <p className="banner">The studio is restarting. You can still create videos; they&apos;ll start automatically in a few minutes.</p>
          )}

          <main className="page">{children}</main>
        </div>

        <nav className="tabbar" aria-label="Main">
          {NAV.filter((n) => n.mobile).map((n) => (
            <a key={n.href} href={n.href} className={isActive(n.href) ? "on" : ""} aria-current={isActive(n.href) ? "page" : undefined}>
              <Icon name={n.icon} size={20} /><span>{n.label === "My videos" ? "Videos" : n.label}</span>
            </a>
          ))}
        </nav>
      </div>

      <dialog ref={plansRef} className="plans-dialog" onClose={() => setShowPlans(false)} aria-labelledby="plans-h">
        <div className="pd-head">
          <h2 id="plans-h">Buy credits</h2>
          <button type="button" className="pd-close" aria-label="Close" onClick={() => setShowPlans(false)}><Icon name="x" /></button>
        </div>
        <p className="muted small">A full video is about 13 credits; each extra language about 3. Payments are handled securely by Stripe.</p>
        <div className="pd-grid">
          {PLANS.filter((p) => p.id !== "free").map((p) => {
            const current = subscribed && account.billing.plan === p.id;
            return (
              <div key={p.id} className={`pd-plan${p.popular ? " pop" : ""}`}>
                {p.popular && <span className="badge">Most popular</span>}
                <b>{p.name}</b>
                <div className="price">{p.price} {p.period && <small>{p.period}</small>}</div>
                <p className="plan-credits">{p.credits}</p>
                <ul>{p.perks.map((k) => <li key={k}>{k}</li>)}</ul>
                {current
                  ? <button type="button" className="btn ghost" onClick={() => void manageBilling()}>Your plan · manage</button>
                  : <button type="button" className={`btn${p.popular ? "" : " ghost"}`} disabled={paying !== null} onClick={() => void checkout(p.id)}>{paying === p.id ? "Opening…" : `Pay ${p.price}${p.period.includes("month") ? " a month" : ""}`}</button>}
              </div>
            );
          })}
        </div>
        <p className="err" role="alert">{payError}</p>
        <p className="fineprint">Monthly plans renew automatically and can be cancelled any time under Billing. Unused credits stay in your account.</p>
      </dialog>

      <div className={`toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast?.text}
        {toast?.action && <a href={toast.action.href}>{toast.action.label}</a>}
      </div>
    </AccountContext.Provider>
  );
}

/** Page heading used across the app. */
export function PageHead({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
