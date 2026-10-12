import type { MediaBytes } from "./providers/types";

/**
 * Checks run before any paid model call.
 *
 * BasicModerator enforces limits and a short blocklist (no API needed).
 * OpenAIModerator adds OpenAI's free omni-moderation model for scripts in
 * any language and for uploaded photos. If that API is unreachable, it falls
 * back to the basic rules for text and lets photos through, logging why,
 * so an outage never blocks every customer.
 */

export type ModerationResult = { ok: true } | { ok: false; reason: string };

export interface Moderator {
  checkScript(text: string): Promise<ModerationResult>;
  /** Optional: check an uploaded photo before it is animated. */
  checkImage?(image: MediaBytes): Promise<ModerationResult>;
}

const MAX_SCRIPT_CHARS = 1200;

const BLOCKED = [/\bnude\b/i, /\bnaked\b/i, /\bporn/i, /\bbomb\b/i, /\bterroris/i];

const SCRIPT_RULES = "This script breaks the Ayiko content rules.";
const IMAGE_RULES = "This photo breaks the Ayiko content rules. Try a different one.";

export class BasicModerator implements Moderator {
  async checkScript(text: string): Promise<ModerationResult> {
    const t = text.trim();
    if (!t) return { ok: false, reason: "Add a script for the voiceover." };
    if (t.length > MAX_SCRIPT_CHARS) {
      return { ok: false, reason: `Keep the script under ${MAX_SCRIPT_CHARS} characters (about 60 seconds of speech).` };
    }
    if (BLOCKED.some((re) => re.test(t))) return { ok: false, reason: SCRIPT_RULES };
    return { ok: true };
  }
}

/**
 * Categories that block a video. Any flagged category in this list stops it;
 * others (e.g. mild violence in an action-film promo) are allowed.
 */
export const BLOCKING_CATEGORIES = [
  "sexual", "sexual/minors", "hate", "hate/threatening", "harassment/threatening",
  "self-harm", "self-harm/intent", "self-harm/instructions", "violence/graphic", "illicit/violent",
] as const;

interface OpenAIModerationResponse {
  results?: { flagged: boolean; categories: Record<string, boolean>; category_scores?: Record<string, number> }[];
}

type Fetch = typeof fetch;

export class OpenAIModerator implements Moderator {
  private readonly basic = new BasicModerator();
  constructor(
    private readonly apiKey: string,
    private readonly opts: { model?: string; fetch?: Fetch; log?: (msg: string) => void } = {},
  ) {}

  private async call(input: unknown[]): Promise<OpenAIModerationResponse> {
    const f = this.opts.fetch ?? fetch;
    const res = await f("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.opts.model ?? "omni-moderation-latest", input }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`moderation HTTP ${res.status}`);
    return (await res.json()) as OpenAIModerationResponse;
  }

  private blocked(r: OpenAIModerationResponse): string[] {
    const cats = r.results?.[0]?.categories ?? {};
    return BLOCKING_CATEGORIES.filter((c) => cats[c]);
  }

  async checkScript(text: string): Promise<ModerationResult> {
    const basic = await this.basic.checkScript(text);
    if (!basic.ok) return basic;
    try {
      const hits = this.blocked(await this.call([{ type: "text", text: text.trim() }]));
      if (hits.length) {
        this.opts.log?.(`script blocked: ${hits.join(", ")}`);
        return { ok: false, reason: SCRIPT_RULES };
      }
      return { ok: true };
    } catch (err) {
      this.opts.log?.(`text moderation unavailable, used basic rules: ${err instanceof Error ? err.message : String(err)}`);
      return basic;
    }
  }

  async checkImage(image: MediaBytes): Promise<ModerationResult> {
    try {
      const url = `data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`;
      const hits = this.blocked(await this.call([{ type: "image_url", image_url: { url } }]));
      if (hits.length) {
        this.opts.log?.(`photo blocked: ${hits.join(", ")}`);
        return { ok: false, reason: IMAGE_RULES };
      }
      return { ok: true };
    } catch (err) {
      this.opts.log?.(`image moderation unavailable, allowed: ${err instanceof Error ? err.message : String(err)}`);
      return { ok: true };
    }
  }
}

export function buildModerator(apiKey: string | undefined, log?: (msg: string) => void): Moderator {
  return apiKey ? new OpenAIModerator(apiKey, { log }) : new BasicModerator();
}
