import type { Config } from "../config";
import type { VoiceProviderId } from "../languages";
import type { FfmpegPaths } from "../media";
import { VoiceRouter } from "../router";
import { ElevenLabsVoiceProvider } from "./elevenlabs";
import { FalVideoProvider } from "./fal";
import { KhayaVoiceProvider } from "./khaya";
import { MockVideoProvider, MockVoiceProvider } from "./mock";
import { NaijaLingoVoiceProvider } from "./naijalingo";
import type { VideoProvider, VoiceProvider } from "./types";

export interface ProviderSet {
  voices: VoiceRouter;
  video: VideoProvider;
  /** Which voice providers are live, for the health check */
  liveVoiceProviders: VoiceProviderId[];
  /** One line describing what is real and what is a stand-in */
  summary: string;
}

/**
 * Builds the providers from config.
 *  - mock: everything is a free local stand-in.
 *  - auto (default): each provider goes live as soon as its key is set; anything
 *    without a key uses the stand-in, so the demo always runs.
 *  - live: real providers only; missing keys are an error (use in production).
 */
export function buildProviders(config: Config, paths: FfmpegPaths): ProviderSet {
  const mode = config.AYIKO_PROVIDER_MODE;
  if (mode === "mock") {
    return {
      voices: new VoiceRouter({}, config, new MockVoiceProvider("mock-voice", paths)),
      video: new MockVideoProvider(paths),
      liveVoiceProviders: [],
      summary: "Test mode: video and voices are local stand-ins (no API calls, no cost).",
    };
  }

  const voices: Partial<Record<VoiceProviderId, VoiceProvider>> = {};
  if (config.ELEVENLABS_API_KEY) voices.elevenlabs = new ElevenLabsVoiceProvider(config.ELEVENLABS_API_KEY, config.ELEVENLABS_MODEL);
  if (config.KHAYA_API_KEY) voices.khaya = new KhayaVoiceProvider(config.KHAYA_API_KEY, config.KHAYA_BASE_URL, config.KHAYA_TTS_PATH);
  if (config.NAIJALINGO_API_KEY) voices.naijalingo = new NaijaLingoVoiceProvider(config.NAIJALINGO_API_KEY, config.NAIJALINGO_BASE_URL);
  const live = Object.keys(voices) as VoiceProviderId[];

  if (mode === "live" && !config.FAL_KEY) {
    throw new Error("Live mode needs FAL_KEY for image-to-video. Add it to .env, or use AYIKO_PROVIDER_MODE=auto.");
  }
  const video: VideoProvider = config.FAL_KEY ? new FalVideoProvider(config.FAL_KEY, config.FAL_I2V_MODEL) : new MockVideoProvider(paths);
  const fallback = mode === "auto" ? new MockVoiceProvider("test-voice", paths) : undefined;

  const summary =
    `Video: ${config.FAL_KEY ? "fal.ai (real AI)" : "test zoom (add FAL_KEY for real AI)"} · ` +
    `Voices: ${live.length ? live.join(", ") + " live" : "none live yet"}` +
    (fallback ? `; languages without a key use the test voice` : "");

  return { voices: new VoiceRouter(voices, config, undefined, fallback), video, liveVoiceProviders: live, summary };
}
