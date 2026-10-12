/**
 * Script assistant: drafts a short voiceover script and translates it.
 *
 *  - Drafting and most translation: Claude (ANTHROPIC_API_KEY)
 *  - Twi, Ewe, Ga and Yoruba translation: GhanaNLP Khaya when KHAYA_API_KEY
 *    is set (specialist models for those languages), else Claude
 *
 * Pure functions with an injectable fetch, so they can be tested offline.
 * No imports, so the engine's test suite can import this file.
 */

type Fetch = typeof fetch;

export interface AssistKeys {
  anthropicKey?: string;
  anthropicModel?: string;
  khayaKey?: string;
  khayaBaseUrl?: string;
  fetch?: Fetch;
}

export const LANGUAGE_INFO: Record<string, { name: string; where: string; notes: string; khaya?: string }> = {
  en: { name: "English", where: "Ghana and Nigeria", notes: "" },
  twi: { name: "Asante Twi", where: "Ghana", notes: "Use standard Akan orthography with ɛ and ɔ.", khaya: "tw" },
  yo: { name: "Yoruba", where: "Nigeria", notes: "Use full tone marks and subdots (ẹ, ọ, ṣ).", khaya: "yo" },
  pcm: { name: "Nigerian Pidgin", where: "Nigeria", notes: "Write it the way people say it in Lagos, friendly and natural." },
  ha: { name: "Hausa", where: "northern Nigeria and Niger", notes: "Use standard Hausa spelling, with ɓ, ɗ and ƙ where they belong." },
  fr: { name: "French", where: "West Africa", notes: "Natural West African French." },
  sw: { name: "Swahili", where: "East Africa", notes: "Standard Swahili." },
  ig: { name: "Igbo", where: "Nigeria", notes: "Use standard Igbo orthography with ị, ọ, ụ and ṅ." },
  ee: { name: "Ewe", where: "Ghana and Togo", notes: "Use standard Ewe orthography (ɛ, ɔ, ɖ, ƒ, ŋ, ʋ).", khaya: "ee" },
  gaa: { name: "Ga", where: "Accra, Ghana", notes: "Use standard Ga orthography (ɛ, ɔ, ŋ).", khaya: "gaa" },
};

const DRAFT_SYSTEM = `You write voiceover scripts for short vertical social videos (TikTok, Reels, WhatsApp Status) for small businesses, churches and creators in West Africa.
Rules:
- 20 to 35 words, about 10 to 15 seconds when spoken.
- Warm, confident, spoken style. Short sentences. Easy for a voice actor to read.
- Start with a hook, give the one key detail (product, price, date or place), end with the call to action if one is given.
- Keep brand names, prices, dates and phone numbers exactly as given. Never invent prices, dates, addresses or claims.
- No hashtags, emojis, stage directions, quotation marks or labels. Output only the script.`;

function translatePrompt(code: string) {
  const l = LANGUAGE_INFO[code]!;
  return `Translate this advert voiceover into ${l.name} as people speak it in ${l.where}. ${l.notes}
Keep it natural and spoken, about the same length, suitable for a voice actor. Keep brand names, prices, dates and phone numbers unchanged. Output only the translation, nothing else.`;
}

async function claude(keys: AssistKeys, system: string, user: string): Promise<string> {
  if (!keys.anthropicKey) throw new Error("assistant_not_configured");
  const f = keys.fetch ?? fetch;
  const res = await f("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": keys.anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: keys.anthropicModel || "claude-haiku-5-5", max_tokens: 500, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`claude HTTP ${res.status}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
  if (!text) throw new Error("claude returned no text");
  return tidy(text);
}

/**
 * GhanaNLP Khaya translation. VERIFY on first live call: endpoint and body
 * follow GhanaNLP's documented /v1/translate shape ({ in, lang: "en-tw" }).
 */
async function khaya(keys: AssistKeys, text: string, target: string): Promise<string> {
  const f = keys.fetch ?? fetch;
  const base = (keys.khayaBaseUrl || "https://translation-api.ghananlp.org").replace(/\/$/, "");
  const res = await f(`${base}/v1/translate`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": keys.khayaKey!, "content-type": "application/json" },
    body: JSON.stringify({ in: text, lang: `en-${target}` }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`khaya HTTP ${res.status}`);
  const body = (await res.text()).trim();
  let out: unknown = body;
  try { out = JSON.parse(body); } catch { /* plain text */ }
  const s = typeof out === "string" ? out : typeof (out as { translation?: string })?.translation === "string" ? (out as { translation: string }).translation : "";
  if (!s.trim()) throw new Error("khaya returned no text");
  return tidy(s);
}

/** Strip wrapping quotes and labels models sometimes add. */
export function tidy(s: string): string {
  return s.trim().replace(/^(script|translation|voiceover)\s*:\s*/i, "").replace(/^["“'‘]+|["”'’]+$/g, "").replace(/\s+/g, " ").trim();
}

export interface DraftInput {
  brief: string;
  template?: string;
  brand?: string;
  cta?: string;
}

export async function draftScript(keys: AssistKeys, input: DraftInput): Promise<string> {
  const parts = [
    `Video type: ${input.template || "product promo"}.`,
    `What it's about: ${input.brief.trim()}`,
    input.brand?.trim() ? `Brand or product name: ${input.brand.trim()}` : "",
    input.cta?.trim() ? `Call to action: ${input.cta.trim()}` : "",
    "Write the English voiceover script.",
  ].filter(Boolean);
  return claude(keys, DRAFT_SYSTEM, parts.join("\n"));
}

export interface Translation { code: string; text: string; source: "khaya" | "claude" }

/** Translate English text into each target language. Khaya first where it applies, Claude otherwise or as backup. */
export async function translateScript(keys: AssistKeys, text: string, targets: string[]): Promise<Translation[]> {
  const jobs = targets.filter((c) => c !== "en" && LANGUAGE_INFO[c]).map(async (code): Promise<Translation> => {
    const k = LANGUAGE_INFO[code]!.khaya;
    if (k && keys.khayaKey) {
      try {
        return { code, text: await khaya(keys, text, k), source: "khaya" };
      } catch {
        /* fall through to Claude */
      }
    }
    return { code, text: await claude(keys, translatePrompt(code), text), source: "claude" };
  });
  return Promise.all(jobs);
}
