/**
 * Checks run before any paid model call. This basic version enforces
 * limits and a short placeholder blocklist; before launch, plug a real
 * moderation API in behind the same interface (text and image).
 */

export type ModerationResult = { ok: true } | { ok: false; reason: string };

export interface Moderator {
  checkScript(text: string): Promise<ModerationResult>;
}

const MAX_SCRIPT_CHARS = 1200;

// Placeholder: replace with a proper multilingual moderation service.
const BLOCKED = [/\bnude\b/i, /\bnaked\b/i, /\bporn/i, /\bbomb\b/i, /\bterroris/i];

export class BasicModerator implements Moderator {
  async checkScript(text: string): Promise<ModerationResult> {
    const t = text.trim();
    if (!t) return { ok: false, reason: "Add a script for the voiceover." };
    if (t.length > MAX_SCRIPT_CHARS) {
      return { ok: false, reason: `Keep the script under ${MAX_SCRIPT_CHARS} characters (about 60 seconds of speech).` };
    }
    if (BLOCKED.some((re) => re.test(t))) {
      return { ok: false, reason: "This script breaks the Ayiko content rules." };
    }
    return { ok: true };
  }
}
