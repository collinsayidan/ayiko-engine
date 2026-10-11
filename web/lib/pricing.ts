/**
 * Credit prices. MUST match the engine (src/credits.ts); tests/web-parity.test.ts
 * in the engine checks they agree. No imports here so the engine can test it.
 */
export const PRICES = { voicePer30s: 2, video5s: 10, video10s: 18, render: 1 } as const;

export function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round((words / 2.5) * 10) / 10);
}

/** Credits for one language's video. Extra languages reuse the first one's clip. */
export function creditsFor(script: string, videoDurationS: 5 | 10, reuseVideo: boolean): number {
  const blocks = Math.max(1, Math.ceil(estimateSpeechSeconds(script) / 30));
  const video = reuseVideo ? 0 : videoDurationS === 10 ? PRICES.video10s : PRICES.video5s;
  return blocks * PRICES.voicePer30s + video + PRICES.render;
}

export function quoteGeneration(scripts: string[], videoDurationS: 5 | 10) {
  const perLanguage = scripts.map((s, i) => creditsFor(s, videoDurationS, i > 0));
  return { perLanguage, total: perLanguage.reduce((a, b) => a + b, 0) };
}
