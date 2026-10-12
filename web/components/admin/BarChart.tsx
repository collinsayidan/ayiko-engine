"use client";

import { useState } from "react";

/**
 * Single-series daily bar chart: thin bars with rounded tops anchored to the
 * baseline, a recessive grid, and a hover/focus tooltip. One series, so the
 * title names it and no legend is needed. A table view sits beside it.
 */
export function BarChart({ data, label, unit }: {
  data: { d: string; v: number }[];
  label: string;
  /** "gbp" formats values given in pence as pounds */
  unit?: "gbp";
}) {
  const format = (n: number) => (unit === "gbp" ? `£${(n / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}` : n.toLocaleString());
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = 160, pad = { l: 36, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...data.map((p) => p.v));
  const top = niceMax(max);
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const h = hover !== null ? data[hover] : null;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}, last ${data.length} days`} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(top * f)} y2={y(top * f)} className="grid" />
            <text x={pad.l - 6} y={y(top * f) + 4} className="tick" textAnchor="end">{format(Math.round(top * f))}</text>
          </g>
        ))}
        {data.map((p, i) => {
          const bh = Math.max(p.v > 0 ? 2 : 0, H - pad.b - y(p.v));
          const x = pad.l + i * bw + Math.max(1, bw * 0.18);
          const wBar = Math.max(2, bw * 0.64);
          const r = Math.min(4, wBar / 2, bh);
          return (
            <g key={p.d}>
              <path className={`bar${hover === i ? " on" : ""}`}
                d={`M${x},${H - pad.b} V${H - pad.b - bh + r} Q${x},${H - pad.b - bh} ${x + r},${H - pad.b - bh} H${x + wBar - r} Q${x + wBar},${H - pad.b - bh} ${x + wBar},${H - pad.b - bh + r} V${H - pad.b} Z`} />
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent"
                tabIndex={0} aria-label={`${day(p.d)}: ${format(p.v)}`}
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
            </g>
          );
        })}
        {data.length > 0 && (
          <>
            <text x={pad.l} y={H - 6} className="tick">{day(data[0]!.d)}</text>
            <text x={W - pad.r} y={H - 6} className="tick" textAnchor="end">{day(data[data.length - 1]!.d)}</text>
          </>
        )}
      </svg>
      <figcaption className={`tip${h ? " show" : ""}`} aria-live="polite">{h ? <><b>{format(h.v)}</b> {day(h.d)}</> : " "}</figcaption>
    </figure>
  );
}

function niceMax(n: number) {
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}
