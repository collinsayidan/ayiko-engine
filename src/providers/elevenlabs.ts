import { postForBytes, type SpeechRequest, type SpeechResult, type VoiceProvider } from "./types";

/**
 * ElevenLabs text-to-speech. Used for English, French, Hausa and Swahili.
 * Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */
export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly id = "elevenlabs";

  constructor(private readonly apiKey: string, private readonly model: string) {}

  async synthesize(req: SpeechRequest): Promise<SpeechResult> {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(req.voiceId)}?output_format=mp3_44100_128`;
    const { bytes } = await postForBytes(
      this.id,
      url,
      { "xi-api-key": this.apiKey, accept: "audio/mpeg" },
      { text: req.text, model_id: this.model, language_code: req.providerLang },
    );
    return { bytes, mime: "audio/mpeg", ext: "mp3", provider: this.id, model: this.model, voiceId: req.voiceId };
  }
}
