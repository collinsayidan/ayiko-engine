import { BarChart } from "./BarChart";
import { LogoMark } from "../Icons";
import { languageByCode } from "@/lib/catalog";

export interface Stats {
  users: { total: number; last7: number; paying: number; byDay: { d: string; n: number }[] };
  videos: { total: number; period: number; failed: number; inQueue: number; byDay: { d: string; n: number }[]; byLanguage: { language: string; n: number; credits: number }[] };
  revenue: { totalPence: number; periodPence: number; byDay: { d: string; pence: number }[]; byPlan: { plan: string; pence: number; n: number }[] };
  providers: { language: string; provider: string; step: string; calls: number; failed: number; costUsd: number; avgSeconds: number | null }[];
  credits: { spentPeriod: number; refundedPeriod: number };
  recentUsers: { name: string | null; joined: string; videos: number; plan: string }[];
}

const gbp = (p: number) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export function AdminView({ stats: s, days }: { stats: Stats; days: number }) {
  const cost = s.providers.reduce((a, p) => a + Number(p.costUsd), 0);

  const byLang = new Map<string, { voice: number; video: number; calls: number; failed: number }>();
  for (const p of s.providers) {
    const r = byLang.get(p.language) ?? { voice: 0, video: 0, calls: 0, failed: 0 };
    if (p.step === "voice") r.voice += Number(p.costUsd); else r.video += Number(p.costUsd);
    r.calls += p.calls; r.failed += p.failed;
    byLang.set(p.language, r);
  }

  return (
    <div className="studio admin">
      <header className="topbar">
        <a className="logo" href="/app"><LogoMark /><span>ayiko<em>.ai</em></span></a>
        <div className="topbar-right">
          <nav className="stage-tabs" aria-label="Period">
            {[7, 30, 90].map((d) => <a key={d} href={`/admin?days=${d}`} className={d === days ? "on" : ""} aria-current={d === days ? "page" : undefined}>{d} days</a>)}
          </nav>
        </div>
      </header>

      <h1 className="admin-h">Dashboard <span className="muted">· last {days} days</span></h1>

      <section className="kpis" aria-label="Key numbers">
        <div className="kpi"><span>Sign-ups</span><b>{s.users.total.toLocaleString()}</b><small>+{s.users.last7} this week</small></div>
        <div className="kpi"><span>Paying customers</span><b>{s.users.paying}</b><small>{pct(s.users.paying, s.users.total)} of sign-ups</small></div>
        <div className="kpi"><span>Revenue</span><b>{gbp(s.revenue.periodPence)}</b><small>{gbp(s.revenue.totalPence)} all time</small></div>
        <div className="kpi"><span>Videos made</span><b>{s.videos.period.toLocaleString()}</b><small>{s.videos.failed} failed · {s.videos.inQueue} in progress</small></div>
        <div className="kpi"><span>Provider cost (est.)</span><b>{usd(cost)}</b><small>{s.videos.period ? `${usd(cost / s.videos.period)} per video` : "no videos yet"}</small></div>
        <div className="kpi"><span>Credits used</span><b>{s.credits.spentPeriod.toLocaleString()}</b><small>{s.credits.refundedPeriod} refunded</small></div>
      </section>

      <section className="panels">
        <div className="panel"><h2>Sign-ups per day</h2><BarChart label="Sign-ups per day" data={s.users.byDay.map((x) => ({ d: x.d, v: x.n }))} /></div>
        <div className="panel"><h2>Videos per day</h2><BarChart label="Videos per day" data={s.videos.byDay.map((x) => ({ d: x.d, v: x.n }))} /></div>
        <div className="panel"><h2>Revenue per day</h2><BarChart label="Revenue per day" data={s.revenue.byDay.map((x) => ({ d: x.d, v: x.pence }))} unit="gbp" /></div>
        <div className="panel">
          <h2>Revenue by plan</h2>
          {s.revenue.byPlan.length ? (
            <table className="tbl"><thead><tr><th>Plan</th><th>Payments</th><th>Revenue</th></tr></thead>
              <tbody>{s.revenue.byPlan.map((p) => <tr key={p.plan}><td>{p.plan}</td><td>{p.n}</td><td>{gbp(p.pence)}</td></tr>)}</tbody></table>
          ) : <p className="muted small">No payments in this period yet.</p>}
        </div>
      </section>

      <section className="panel wide">
        <h2>Cost and quality per language</h2>
        <p className="muted small">Provider costs are estimates unless the provider reports a price (see src/costs.ts). Failures count every provider attempt, including ones the router recovered from.</p>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Language</th><th>Videos</th><th>Credits</th><th>Voice cost</th><th>Clip cost</th><th>Cost per video</th><th>Provider failures</th></tr></thead>
            <tbody>
              {s.videos.byLanguage.length === 0 && <tr><td colSpan={7} className="muted">No videos in this period yet.</td></tr>}
              {s.videos.byLanguage.map((l) => {
                const c = byLang.get(l.language) ?? { voice: 0, video: 0, calls: 0, failed: 0 };
                return (
                  <tr key={l.language}>
                    <td>{languageByCode(l.language)?.name ?? l.language}</td><td>{l.n}</td><td>{l.credits}</td>
                    <td>{usd(c.voice)}</td><td>{usd(c.video)}</td><td>{usd((c.voice + c.video) / Math.max(1, l.n))}</td>
                    <td>{c.failed} of {c.calls}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h3>By provider</h3>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Provider</th><th>Step</th><th>Language</th><th>Calls</th><th>Failed</th><th>Avg time</th><th>Cost</th></tr></thead>
            <tbody>
              {s.providers.length === 0 && <tr><td colSpan={7} className="muted">No provider calls in this period yet.</td></tr>}
              {s.providers.map((p, i) => (
                <tr key={i}><td>{p.provider}</td><td>{p.step}</td><td>{languageByCode(p.language)?.name ?? p.language}</td><td>{p.calls}</td><td>{p.failed}</td><td>{p.avgSeconds ?? "—"}s</td><td>{usd(Number(p.costUsd))}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel wide">
        <h2>Newest accounts</h2>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Joined</th><th>Videos</th><th>Plan</th></tr></thead>
            <tbody>{s.recentUsers.map((u, i) => <tr key={i}><td>{u.name ?? "—"}</td><td>{new Date(u.joined).toLocaleDateString("en-GB")}</td><td>{u.videos}</td><td>{u.plan}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
