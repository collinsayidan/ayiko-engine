import { extFromMime, postForBytes, type SpeechRequest, type SpeechResult, type VoiceProvider } from "./types";

/**
 * 9jaLingo text-to-speech: Yoruba, Igbo, Hausa and Nigerian Pidgin.
 *
 * VERIFY ON FIRST LIVE RUN: the base URL, `/v1/audio/speech` path, speaker
 * ids (e.g. `adeola_yo`) and language codes come from the official SDK
 * docs. The raw JSON field names and the Bearer auth header follow the
 * SDK's OpenAI-style endpoint; adjust `buildBody` if the first call fails.
 */
export class NaijaLingoVoiceProvider implements VoiceProvider {
  readonly id = "naijalingo";

  constructor(private readonly apiKey: string, private readonly baseUrl: string) {}

  buildBody(req: SpeechRequest): Record<string, string> {
    return { input: req.text, voice: req.voiceId, language: req.providerLang, response_format: "mp3" };
  }

  async synthesize(req: SpeechRequest): Promise<SpeechResult> {
    const { bytes, contentType } = await postForBytes(
      this.id,
      new URL("/v1/audio/speech", this.baseUrl).toString(),
      { authorization: `Bearer ${this.apiKey}` },
      this.buildBody(req),
    );
    return { bytes, mime: contentType, ext: extFromMime(contentType, "mp3"), provider: this.id, voiceId: req.voiceId };
  }
}
