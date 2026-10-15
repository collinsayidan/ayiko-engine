/**
 * Editing-canvas design values. Mirrors the engine's Design / cleanDesign
 * (src/captions.ts), which re-checks everything before rendering.
 */
export interface Design {
  captionY?: number;
  headlineY?: number;
  accent?: string;
  highlight?: string;
  captionScale?: number;
  uppercase?: boolean;
}

/** Where things sit when nothing has been moved (matches the renderer's house style). */
export const DEFAULTS = { captionY: 1 - 330 / 1920, headlineY: 200 / 1920, accent: "#5468FF", highlight: "#45D3E8", captionScale: 1, uppercase: false };

export const ACCENTS = ["#5468FF", "#E05A8A", "#E68A3C", "#12A8C0", "#2E9E6B", "#14132A"];
export const HIGHLIGHTS = ["#45D3E8", "#FFD400", "#FF7A66", "#7CF29A", "#FFFFFF"];

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (n: unknown, lo: number, hi: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined);

export function cleanDesign(d: unknown): Design {
  if (!d || typeof d !== "object") return {};
  const x = d as Record<string, unknown>;
  const out: Design = {};
  const cy = clamp(x.captionY, 0.15, 0.95); if (cy !== undefined) out.captionY = Math.round(cy * 1000) / 1000;
  const hy = clamp(x.headlineY, 0.03, 0.8); if (hy !== undefined) out.headlineY = Math.round(hy * 1000) / 1000;
  const sc = clamp(x.captionScale, 0.7, 1.4); if (sc !== undefined) out.captionScale = Math.round(sc * 100) / 100;
  if (typeof x.accent === "string" && HEX.test(x.accent)) out.accent = x.accent.toUpperCase();
  if (typeof x.highlight === "string" && HEX.test(x.highlight)) out.highlight = x.highlight.toUpperCase();
  if (typeof x.uppercase === "boolean") out.uppercase = x.uppercase;
  return out;
}

/** Split the script into the short phrases the renderer shows (about 20 characters a line). */
export function phrases(script: string): string[] {
  const words = script.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur: string[] = [];
  for (const w of words) {
    if (cur.join(" ").length + w.length > 22 && cur.length) { out.push(cur.join(" ")); cur = []; }
    cur.push(w);
    if (/[.!?]$/.test(w)) { out.push(cur.join(" ")); cur = []; }
  }
  if (cur.length) out.push(cur.join(" "));
  return out.length ? out : ["Your captions appear here"];
}
