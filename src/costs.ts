/**
 * Estimated provider costs (USD) for the admin dashboard, used when a
 * provider doesn't report its own price. Check them against your invoices
 * and adjust with the env overrides below.
 */
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export const COSTS = {
  /** fal.ai image-to-video, per second of clip (Kling standard ≈ $0.05/s) */
  videoPerSecond: num(process.env.COST_VIDEO_PER_SECOND_USD, 0.05),
  /** ElevenLabs, per 1,000 characters */
  elevenPer1kChars: num(process.env.COST_ELEVENLABS_PER_1K_CHARS_USD, 0.15),
  /** GhanaNLP Khaya, per 1,000 characters (subscription plans are close to free per call) */
  khayaPer1kChars: num(process.env.COST_KHAYA_PER_1K_CHARS_USD, 0.01),
  /** 9jaLingo, per 1,000 characters */
  naijaPer1kChars: num(process.env.COST_NAIJALINGO_PER_1K_CHARS_USD, 0.02),
};

export function estimateVoiceCost(provider: string, text: string): number {
  const k = [...text].length / 1000;
  if (provider.startsWith("elevenlabs")) return round(k * COSTS.elevenPer1kChars);
  if (provider.startsWith("khaya")) return round(k * COSTS.khayaPer1kChars);
  if (provider.startsWith("naijalingo")) return round(k * COSTS.naijaPer1kChars);
  return 0;
}

export function estimateVideoCost(provider: string, seconds: number): number {
  return provider.startsWith("fal") ? round(seconds * COSTS.videoPerSecond) : 0;
}

const round = (n: number) => Math.round(n * 10000) / 10000;
