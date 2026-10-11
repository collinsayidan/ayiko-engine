import type { Gender, LanguageCode } from "../languages";

export interface MediaBytes {
  bytes: Uint8Array;
  mime: string;
  /** File extension without the dot, e.g. "mp3" */
  ext: string;
}

export interface SpeechRequest {
  text: string;
  language: LanguageCode;
  /** Provider-specific language code from the routing table */
  providerLang: string;
  voiceId: string;
  gender: Gender;
}

export interface SpeechResult extends MediaBytes {
  provider: string;
  model?: string;
  voiceId: string;
  /** Best estimate of what this call cost us, for margin tracking */
  costUsd?: number;
  /** Set when the provider returned the speech in several pieces */
  segments?: MediaBytes[];
}

export interface VoiceProvider {
  readonly id: string;
  synthesize(req: SpeechRequest): Promise<SpeechResult>;
}

export interface ImageToVideoRequest {
  image: MediaBytes;
  prompt: string;
  durationS: 5 | 10;
}

export interface VideoResult extends MediaBytes {
  provider: string;
  model: string;
  costUsd?: number;
}

export interface VideoProvider {
  readonly id: string;
  imageToVideo(req: ImageToVideoRequest): Promise<VideoResult>;
}

/** Thrown for errors worth trying the next provider for. */
export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly status?: number,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
  }
}

/** Shared helper: POST JSON and get audio bytes back, with a clear error on failure. */
export async function postForBytes(
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs = 60_000,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new ProviderError(provider, `HTTP ${res.status}: ${detail}`, res.status);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length === 0) throw new ProviderError(provider, "empty audio response");
  return { bytes, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}

export function extFromMime(mime: string, fallback = "bin"): string {
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return fallback;
}
