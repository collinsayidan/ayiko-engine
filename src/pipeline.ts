import { quoteShort, type Ledger, type Quote } from "./credits";
import type { JobStore } from "./jobs";
import { isLanguageCode, type Gender, type LanguageCode } from "./languages";
import { DEFAULT_FFMPEG, normaliseAudio, type FfmpegPaths } from "./media";
import type { Moderator } from "./moderation";
import type { MediaBytes, VideoProvider } from "./providers/types";
import type { CaptionStyle } from "./captions";
import { renderShort, type AspectRatio } from "./render";
import type { VoiceRouter } from "./router";
import { keys, type Storage } from "./storage";

/**
 * The captioned-short pipeline:
 *   start (validate, moderate, charge) → voice → video → render → finish
 * Each step reads and writes storage keys, never in-memory buffers, so the
 * same functions run in one process (CLI, tests) or as separate retryable
 * steps in the job queue (see inngest.ts).
 */

export interface ShortRequest {
  userId: string;
  projectId?: string;
  /** Storage key of the uploaded image */
  imageKey: string;
  script: string;
  language: LanguageCode;
  gender: Gender;
  motionPrompt?: string;
  videoDurationS?: 5 | 10;
  aspect?: AspectRatio;
  /** Free plan outputs carry a small "ayiko.ai" mark */
  watermark?: boolean;
  /** On-screen design: short headline tag, end-card brand name and call to action */
  headline?: string;
  brandName?: string;
  cta?: string;
  captionStyle?: CaptionStyle;
  /** Regenerate cheaply: keep the clip and change only the voice, or the reverse */
  reuse?: { videoKey?: string; voiceKey?: string };
}

export interface EngineDeps {
  voices: VoiceRouter;
  video: VideoProvider;
  storage: Storage;
  ledger: Ledger;
  jobs: JobStore;
  moderator: Moderator;
  paths?: FfmpegPaths;
  captionFont?: string;
}

export interface StartedJob {
  jobId: string;
  quote: Quote;
  balanceAfter: number;
}

export interface ShortResult extends StartedJob {
  outputKey: string;
  voiceKey: string;
  videoKey: string;
  durationS: number;
}

export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRequestError";
  }
}

const DEFAULT_MOTION = "slow cinematic push-in, soft natural light, subtle movement, product stays in focus";

/** Validate, moderate, create the job and charge credits. Nothing paid happens before this succeeds. */
export async function startShort(req: ShortRequest, deps: EngineDeps): Promise<StartedJob> {
  if (!isLanguageCode(req.language)) throw new InvalidRequestError(`Unsupported language: ${req.language}`);
  const mod = await deps.moderator.checkScript(req.script);
  if (!mod.ok) throw new InvalidRequestError(mod.reason);
  if (!req.reuse?.voiceKey && deps.voices.plan(req.language, req.gender).length === 0) {
    throw new InvalidRequestError(`No voice is available for ${req.language} yet.`);
  }

  const quote = quoteShort({
    script: req.script,
    videoDurationS: req.videoDurationS ?? 5,
    reuseVideo: Boolean(req.reuse?.videoKey),
    reuseVoice: Boolean(req.reuse?.voiceKey),
  });

  const job = await deps.jobs.create({
    userId: req.userId, projectId: req.projectId, language: req.language,
    request: { ...req } as unknown as Record<string, unknown>,
  });
  try {
    const balanceAfter = await deps.ledger.spend(req.userId, quote.total, job.id);
    await deps.jobs.update(job.id, { status: "running", creditsCharged: quote.total });
    return { jobId: job.id, quote, balanceAfter };
  } catch (err) {
    await deps.jobs.update(job.id, { status: "failed", error: err instanceof Error ? err.message : String(err), finishedAt: new Date().toISOString() });
    throw err;
  }
}

export async function stepVoice(jobId: string, req: ShortRequest, deps: EngineDeps): Promise<string> {
  if (req.reuse?.voiceKey) return req.reuse.voiceKey;
  await deps.jobs.update(jobId, { currentStep: "voice" });
  try {
    const { result, attempts } = await deps.voices.synthesize(req.script, req.language, req.gender);
    const { audio } = await normaliseAudio(result.segments ?? [result], deps.paths ?? DEFAULT_FFMPEG);
    const key = await deps.storage.put(keys.voice(req.userId, jobId), audio);
    for (const a of attempts) {
      await deps.jobs.addGeneration({
        jobId, step: "voice", provider: a.provider, voiceId: a.voiceId, language: req.language,
        status: a.ok ? "succeeded" : "failed", latencyMs: a.latencyMs, error: a.error,
        model: a.ok ? result.model : undefined, costUsd: a.ok ? result.costUsd : undefined,
        outputKey: a.ok ? key : undefined,
      });
    }
    return key;
  } catch (err) {
    const attempts = (err as { attempts?: { provider: string; voiceId: string; latencyMs: number; error?: string }[] }).attempts ?? [];
    for (const a of attempts) {
      await deps.jobs.addGeneration({ jobId, step: "voice", provider: a.provider, voiceId: a.voiceId, language: req.language, status: "failed", latencyMs: a.latencyMs, error: a.error });
    }
    throw err;
  }
}

export async function stepVideo(jobId: string, req: ShortRequest, deps: EngineDeps): Promise<string> {
  if (req.reuse?.videoKey) return req.reuse.videoKey;
  await deps.jobs.update(jobId, { currentStep: "video" });
  const image: MediaBytes = await deps.storage.get(req.imageKey);
  const started = Date.now();
  try {
    const clip = await deps.video.imageToVideo({
      image, prompt: req.motionPrompt?.trim() || DEFAULT_MOTION, durationS: req.videoDurationS ?? 5,
    });
    const key = await deps.storage.put(keys.clip(req.userId, jobId), clip);
    await deps.jobs.addGeneration({
      jobId, step: "video", provider: clip.provider, model: clip.model, status: "succeeded",
      latencyMs: Date.now() - started, costUsd: clip.costUsd, outputKey: key,
    });
    return key;
  } catch (err) {
    await deps.jobs.addGeneration({
      jobId, step: "video", provider: deps.video.id, status: "failed",
      latencyMs: Date.now() - started, error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function stepRender(
  jobId: string, req: ShortRequest, voiceKey: string, videoKey: string, deps: EngineDeps,
): Promise<{ outputKey: string; durationS: number }> {
  await deps.jobs.update(jobId, { currentStep: "render" });
  const started = Date.now();
  const [voice, video] = await Promise.all([deps.storage.get(voiceKey), deps.storage.get(videoKey)]);
  const out = await renderShort({
    video, voice, script: req.script, aspect: req.aspect, captionStyle: req.captionStyle,
    headline: req.headline, brand: req.brandName, cta: req.cta,
    watermark: req.watermark ? "ayiko.ai" : undefined, paths: deps.paths,
  });
  const outputKey = await deps.storage.put(keys.output(req.userId, jobId), out.video);
  await deps.jobs.addGeneration({ jobId, step: "render", provider: "ffmpeg", status: "succeeded", latencyMs: Date.now() - started, outputKey });
  return { outputKey, durationS: out.durationS };
}

export async function finishShort(jobId: string, outputKey: string, deps: EngineDeps) {
  await deps.jobs.update(jobId, { status: "succeeded", outputKey, currentStep: undefined, finishedAt: new Date().toISOString() });
}

/** Any failure after charging refunds the job in full. */
export async function failShort(jobId: string, err: unknown, deps: EngineDeps) {
  await deps.ledger.refund(jobId);
  await deps.jobs.update(jobId, { status: "failed", error: err instanceof Error ? err.message : String(err), finishedAt: new Date().toISOString() });
}

export interface MultiplierLanguage {
  language: LanguageCode;
  script: string;
  gender?: Gender;
}

export type MultiplierItem =
  | ({ ok: true; language: LanguageCode } & ShortResult)
  | { ok: false; language: LanguageCode; error: string };

/**
 * Language Multiplier: one product clip, many languages.
 *
 * Inspired by Higgsfield's Ad Multiplier, but aimed at Ayiko's edge. The
 * expensive AI clip is made once (first language); every other language
 * reuses it and pays only for its voice and render. Each language is its
 * own job, so one failing voice refunds only that language.
 */
export async function runLanguageMultiplier(
  base: Omit<ShortRequest, "language" | "script" | "reuse">,
  languages: MultiplierLanguage[],
  deps: EngineDeps,
): Promise<MultiplierItem[]> {
  if (languages.length === 0) throw new InvalidRequestError("Pick at least one language.");
  if (new Set(languages.map((l) => l.language)).size !== languages.length) {
    throw new InvalidRequestError("Each language can only appear once.");
  }

  const [first, ...rest] = languages;
  const results: MultiplierItem[] = [];

  // The first language makes the clip. If it fails, nothing else can run.
  const lead = await runCaptionedShort(
    { ...base, language: first!.language, script: first!.script, gender: first!.gender ?? base.gender },
    deps,
  );
  results.push({ ok: true, language: first!.language, ...lead });

  for (const l of rest) {
    try {
      const r = await runCaptionedShort(
        { ...base, language: l.language, script: l.script, gender: l.gender ?? base.gender, reuse: { videoKey: lead.videoKey } },
        deps,
      );
      results.push({ ok: true, language: l.language, ...r });
    } catch (err) {
      results.push({ ok: false, language: l.language, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

/** Run the whole pipeline in one process. */
export async function runCaptionedShort(req: ShortRequest, deps: EngineDeps): Promise<ShortResult> {
  const started = await startShort(req, deps);
  try {
    // Voice and video don't depend on each other, so they run in parallel.
    const [voiceKey, videoKey] = await Promise.all([
      stepVoice(started.jobId, req, deps),
      stepVideo(started.jobId, req, deps),
    ]);
    const { outputKey, durationS } = await stepRender(started.jobId, req, voiceKey, videoKey, deps);
    await finishShort(started.jobId, outputKey, deps);
    return { ...started, outputKey, voiceKey, videoKey, durationS };
  } catch (err) {
    await failShort(started.jobId, err, deps);
    throw err;
  }
}
