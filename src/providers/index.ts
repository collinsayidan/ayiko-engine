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
}

/** Builds the providers from config. Live providers are only registered when their key is set. */
export function buildProviders(config: Config, paths: FfmpegPaths): ProviderSet {
  if (config.AYIKO_PROVIDER_MODE === "mock") {
    return {
      voices: new VoiceRouter({}, config, new MockVoiceProvider("mock-voice", paths)),
      video: new MockVideoProvider(paths),
      liveVoiceProviders: [],
    };
  }

  const voices: Partial<Record<VoiceProviderId, VoiceProvider>> = {};
  if (config.ELEVENLABS_API_KEY) voices.elevenlabs = new ElevenLabsVoiceProvider(config.ELEVENLABS_API_KEY, config.ELEVENLABS_MODEL);
  if (config.KHAYA_API_KEY) voices.khaya = new KhayaVoiceProvider(config.KHAYA_API_KEY, config.KHAYA_BASE_URL, config.KHAYA_TTS_PATH);
  if (config.NAIJALINGO_API_KEY) voices.naijalingo = new NaijaLingoVoiceProvider(config.NAIJALINGO_API_KEY, config.NAIJALINGO_BASE_URL);

  if (!config.FAL_KEY) throw new Error("Live mode needs FAL_KEY for image-to-video. Set it, or use AYIKO_PROVIDER_MODE=mock.");

  return {
    voices: new VoiceRouter(voices, config),
    video: new FalVideoProvider(config.FAL_KEY, config.FAL_I2V_MODEL),
    liveVoiceProviders: Object.keys(voices) as VoiceProviderId[],
  };
}
