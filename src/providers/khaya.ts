import { extFromMime, postForBytes, type SpeechRequest, type SpeechResult, type VoiceProvider } from "./types";

/**
 * GhanaNLP Khaya text-to-speech: Twi, Ga, Ewe, Fante, Yoruba and more.
 *
 * VERIFY ON FIRST LIVE RUN: Khaya publishes a Python SDK, not a REST
 * reference. The base URL and the `/tts/v2/synthesize` path come from the
 * SDK's configuration docs. The auth header follows GhanaNLP's Azure API
 * Management gateway (`Ocp-Apim-Subscription-Key`). The body field names
 * below are our best reading of the SDK; if the first call returns 400,
 * compare with the SDK source (github.com/Khaya-AI/khaya-sdk) and adjust
 * `buildBody` only. Path and base URL are configurable via env.
 */
export class KhayaVoiceProvider implements VoiceProvider {
  readonly id = "khaya";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly ttsPath: string,
  ) {}

  buildBody(req: SpeechRequest): Record<string, string> {
    return { text: req.text, language: req.providerLang, speaker: req.voiceId };
  }

  async synthesize(req: SpeechRequest): Promise<SpeechResult> {
    // Khaya has a per-request character limit, so long scripts go in sentence chunks.
    const chunks = chunkForTts(req.text, 400);
    const parts: Uint8Array[] = [];
    let mime = "audio/wav";
    for (const chunk of chunks) {
      const { bytes, contentType } = await postForBytes(
        this.id,
        new URL(this.ttsPath, this.baseUrl).toString(),
        { "Ocp-Apim-Subscription-Key": this.apiKey, "cache-control": "no-cache" },
        this.buildBody({ ...req, text: chunk }),
      );
      parts.push(bytes);
      mime = contentType;
    }
    const ext = extFromMime(mime, "wav");
    return {
      bytes: parts[0]!,
      mime,
      ext,
      // Several chunks are joined into one track by media.normaliseAudio
      segments: parts.length > 1 ? parts.map((bytes) => ({ bytes, mime, ext })) : undefined,
      provider: this.id,
      voiceId: req.voiceId,
    };
  }
}

/** Split text at sentence ends so each piece stays under `max` characters. */
export function chunkForTts(text: string, max: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
