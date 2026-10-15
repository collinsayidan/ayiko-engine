import { LIMITS } from "./catalog";
import { DEFAULTS } from "./design";

/**
 * Brand kit: saved on the account (Supabase auth user_metadata.brand_kit, so no
 * table is needed) and applied to every new video.
 */
export interface BrandKit {
  brandName: string;
  cta: string;
  accent: string;
  highlight: string;
  captionStyle: "pop" | "box";
  uppercase: boolean;
}

export const EMPTY_BRAND: BrandKit = { brandName: "", cta: "", accent: DEFAULTS.accent, highlight: DEFAULTS.highlight, captionStyle: "pop", uppercase: false };

const HEX = /^#[0-9a-fA-F]{6}$/;
const text = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

export function cleanBrandKit(v: unknown): BrandKit {
  const x = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    brandName: text(x.brandName, LIMITS.brand),
    cta: text(x.cta, LIMITS.cta),
    accent: typeof x.accent === "string" && HEX.test(x.accent) ? x.accent.toUpperCase() : EMPTY_BRAND.accent,
    highlight: typeof x.highlight === "string" && HEX.test(x.highlight) ? x.highlight.toUpperCase() : EMPTY_BRAND.highlight,
    captionStyle: x.captionStyle === "box" ? "box" : "pop",
    uppercase: x.uppercase === true,
  };
}
