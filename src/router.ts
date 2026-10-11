import type { Config } from "./config";
import { LANGUAGES, type Gender, type LanguageCode, type VoiceProviderId } from "./languages";
import type { SpeechResult, VoiceProvider } from "./providers/types";

export interface VoiceAttempt {
  provider: string;
  voiceId: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface RoutedSpeech {
  result: SpeechResult;
  attempts: VoiceAttempt[];
}

export class NoVoiceAvailableError extends Error {
  constructor(public readonly language: LanguageCode, public readonly attempts: VoiceAttempt[]) {
    super(
      attempts.length
        ? `No voice provider succeeded for ${language}: ` + attempts.map((a) => `${a.provider} (${a.error})`).join("; ")
        : `No voice provider is configured for ${language}`,
    );
    this.name = "NoVoiceAvailableError";
  }
}

/**
 * Picks the voice provider for a language and falls back down the list.
 * Providers without an API key are simply not registered, so they are skipped.
 */
export class VoiceRouter {
  constructor(
    private readonly providers: Partial<Record<VoiceProviderId, VoiceProvider>>,
    private readonly config: Pick<Config, "ELEVENLABS_VOICE_FEMALE" | "ELEVENLABS_VOICE_MALE">,
    /** When set, every language is served by this provider (mock mode). */
    private readonly override?: VoiceProvider,
  ) {}

  /** The ordered candidates that can actually run, for a language and gender. */
  plan(language: LanguageCode, gender: Gender): { provider: VoiceProvider; voiceId: string; providerLang: string }[] {
    const lang = LANGUAGES[language];
    return lang.candidates.flatMap((c) => {
      const provider = this.override ?? this.providers[c.provider];
      if (!provider) return [];
      return [{ provider, voiceId: this.resolveVoice(c.voices[gender]), providerLang: c.providerLang }];
    });
  }

  async synthesize(text: string, language: LanguageCode, gender: Gender): Promise<RoutedSpeech> {
    const attempts: VoiceAttempt[] = [];
    for (const { provider, voiceId, providerLang } of this.plan(language, gender)) {
      const started = Date.now();
      try {
        const result = await provider.synthesize({ text, language, providerLang, voiceId, gender });
        attempts.push({ provider: provider.id, voiceId, ok: true, latencyMs: Date.now() - started });
        return { result, attempts };
      } catch (err) {
        attempts.push({
          provider: provider.id, voiceId, ok: false, latencyMs: Date.now() - started,
          error: err instanceof Error ? err.message : String(err),
        });
        // Fall through to the next candidate.
      }
    }
    throw new NoVoiceAvailableError(language, attempts);
  }

  private resolveVoice(v: string): string {
    if (!v.startsWith("env:")) return v;
    const key = v.slice(4) as keyof typeof this.config;
    return this.config[key] ?? v;
  }
}
