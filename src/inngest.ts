import { Inngest } from "inngest";
import { loadConfig } from "./config";
import { BasicModerator } from "./moderation";
import { failShort, finishShort, startShort, stepRender, stepVideo, stepVoice, type EngineDeps, type ShortRequest } from "./pipeline";
import { buildProviders } from "./providers";
import { buildStorage } from "./storage";
import { SupabaseJobStore, SupabaseLedger, supabaseAdmin } from "./supabase";

/**
 * Background job runner for production. The web app sends
 * `ayiko/short.requested` with a ShortRequest; each stage runs as its own
 * retryable step, so a flaky provider call is retried without re-charging
 * or redoing the stages that already finished.
 *
 * Serve it from the Next.js app with:
 *   import { serve } from "inngest/next";
 *   export const { GET, POST, PUT } = serve({ client: inngest, functions: [captionedShort] });
 */
export const inngest = new Inngest({ id: "ayiko" });

let cached: EngineDeps | undefined;
function deps(): EngineDeps {
  if (cached) return cached;
  const config = loadConfig();
  const paths = { ffmpeg: config.FFMPEG_PATH, ffprobe: config.FFPROBE_PATH };
  const { voices, video } = buildProviders(config, paths);
  const db = supabaseAdmin(config);
  cached = {
    voices, video, paths,
    storage: buildStorage(config),
    ledger: new SupabaseLedger(db),
    jobs: new SupabaseJobStore(db),
    moderator: new BasicModerator(),
    captionFont: config.CAPTION_FONT,
  };
  return cached;
}

export const captionedShort = inngest.createFunction(
  {
    id: "captioned-short",
    triggers: [{ event: "ayiko/short.requested" }],
    retries: 2,
    // One user can't flood the queue
    concurrency: { key: "event.data.userId", limit: 2 },
  },
  async ({ event, step }) => {
    const req = event.data as ShortRequest;
    const d = deps();

    const started = await step.run("start-and-charge", () => startShort(req, d));
    try {
      const [voiceKey, videoKey] = await Promise.all([
        step.run("voice", () => stepVoice(started.jobId, req, d)),
        step.run("video", () => stepVideo(started.jobId, req, d)),
      ]);
      const out = await step.run("render", () => stepRender(started.jobId, req, voiceKey, videoKey, d));
      await step.run("finish", () => finishShort(started.jobId, out.outputKey, d));
      return { jobId: started.jobId, ...out };
    } catch (err) {
      await step.run("refund", () => failShort(started.jobId, err, d));
      throw err;
    }
  },
);
