import { z } from "zod";

const Env = z.object({
  AYIKO_PROVIDER_MODE: z.enum(["mock", "auto", "live"]).default("auto"),

  FAL_KEY: z.string().optional(),
  FAL_I2V_MODEL: z.string().default("fal-ai/kling-video/v2.1/standard/image-to-video"),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_MODEL: z.string().default("eleven_v3"),
  ELEVENLABS_VOICE_FEMALE: z.string().default("21m00Tcm4TlvDq8ikWAM"),
  ELEVENLABS_VOICE_MALE: z.string().default("JBFqnCBsd6RMkjVDRZzb"),

  KHAYA_API_KEY: z.string().optional(),
  KHAYA_BASE_URL: z.string().default("https://translation-api.ghananlp.org"),
  KHAYA_TTS_PATH: z.string().default("/tts/v2/synthesize"),

  NAIJALINGO_API_KEY: z.string().optional(),
  NAIJALINGO_BASE_URL: z.string().default("https://api.9jalingo.org"),

  STORAGE: z.enum(["local", "supabase", "r2"]).default("local"),
  SUPABASE_BUCKET: z.string().default("media"),
  LOCAL_STORAGE_DIR: z.string().default("./.ayiko-storage"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default("ayiko-media"),

  SUPABASE_URL: z.string().optional(),
  /** Supabase "secret" key (new name) or legacy service_role key. Server only. */
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  /** OpenAI key for the free moderation model (scripts and photos). Optional. */
  OPENAI_API_KEY: z.string().optional(),

  /** Resend key and sender for "your video is ready" emails. Optional. */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Ayiko <hello@ayiko.ai>"),
  SITE_URL: z.string().default("https://ayiko.ai"),

  WORKER_ID: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  WORKER_POLL_MS: z.coerce.number().int().min(500).default(3000),

  CAPTION_FONT: z.string().default("Inter"),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
});

export type Config = z.infer<typeof Env>;

/** Reads config from the environment. Empty strings count as unset. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  return Env.parse(cleaned);
}
