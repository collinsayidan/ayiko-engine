"use client";

import { languageByCode } from "@/lib/catalog";
import { PLANS, planById } from "@/lib/content";
import type { LedgerRow } from "@/lib/studio";
import { Icon } from "./icons";
import { PageHead, useAccount } from "./Shell";

const REASON: Record<string, string> = {
  signup_bonus: "Welcome credits", purchase: "Credits bought", subscription: "Monthly credits",
  generation: "Video", refund: "Refund", admin: "Adjustment",
};

export function BillingView({ history, spent }: { history: LedgerRow[]; spent: { credits: number; since: string } }) {
  const { account, subscribed, openPlans, manageBilling } = useAccount();
  const b = account.billing;
  const plan = planById(subscribed ? b.plan : null);
  const monthly = plan ? Number.parseInt(plan.credits, 10) : 0;

  return (
    <>
      <PageHead title="Billing and usage" sub="Your plan, your credits and where they went." />

      <div className="bill-grid">
        <section className="panel bill-card">
          <span className="kicker">Plan</span>
          <h2>{plan ? plan.name : "Free trial"}</h2>
          <p className="muted">
            {plan
              ? <>{plan.price} {plan.period} · {plan.credits}{b.renewsAt && <><br />{b.cancelAtPeriodEnd ? "Ends" : "Renews"} on {new Date(b.renewsAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</>}</>
              : "20 free credits to try Ayiko. Videos carry a small ayiko.ai mark until you buy credits."}
          </p>
          {b.status === "past_due" && <p className="err">Your last payment didn&apos;t go through. Update your card to keep your plan.</p>}
          <div className="bill-actions">
            {b.enabled && <button type="button" className="btn" onClick={openPlans}><Icon name="bolt" size={16} />{subscribed ? "Buy more credits" : "Upgrade"}</button>}
            {b.enabled && b.hasCustomer && <button type="button" className="btn ghost" onClick={() => void manageBilling()}>Card, invoices and cancelling</button>}
            {!b.enabled && <p className="muted small">Card payments open soon.</p>}
          </div>
        </section>

        <section className="panel bill-card">
          <span className="kicker">Credits</span>
          <h2 className="big-num">{account.balance}<small> left</small></h2>
          {monthly > 0 && (
            <div className="meter-bar large" aria-hidden="true"><i style={{ width: `${Math.min(100, (account.balance / Math.max(monthly, account.balance)) * 100)}%` }} /></div>
          )}
          <p className="muted small">
            {spent.credits} used since {new Date(spent.since).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.
            {" "}A video is about 13 credits; each extra language about 3. Unused credits never expire.
          </p>
        </section>
      </div>

      <section className="panel">
        <h2>Credit history</h2>
        {history.length === 0 ? <p className="muted">Nothing yet.</p> : (
          <div className="tbl-wrap">
            <table className="tbl history">
              <thead><tr><th>Date</th><th>What</th><th className="num">Credits</th></tr></thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} <span className="muted">{new Date(r.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span></td>
                    <td>{REASON[r.reason] ?? r.reason}{r.title && <span className="muted">: {r.title}{r.language ? ` (${languageByCode(r.language)?.name ?? r.language})` : ""}</span>}</td>
                    <td className={`num ${r.delta > 0 ? "plus" : "minus"}`}>{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Plans</h2>
        <div className="plan-list">
          {PLANS.filter((p) => p.id !== "free").map((p) => (
            <div key={p.id} className={`plan-line${subscribed && b.plan === p.id ? " current" : ""}`}>
              <div><b>{p.name}</b><span className="muted small">{p.credits} · {p.perks.join(" · ")}</span></div>
              <span className="price-sm">{p.price} <small>{p.period}</small></span>
            </div>
          ))}
        </div>
        {b.enabled && <button type="button" className="linkish" onClick={openPlans}>Compare and buy</button>}
      </section>
    </>
  );
}
