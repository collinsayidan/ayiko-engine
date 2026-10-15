import { hostname } from "node:os";
import { pathToFileURL } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanDesign } from "./captions";
import { loadConfig } from "./config";
import { isLanguageCode, LANGUAGES, type LanguageCode } from "./languages";
import { buildModerator } from "./moderation";
import { renderReadyEmail, sendWithResend } from "./email";
import { InvalidRequestError, stepRender, stepVideo, stepVoice, type EngineDeps, type ShortRequest } from "./pipeline";
import { buildProviders } from "./providers";
import { buildStorage } from "./storage";
import { SupabaseJobStore, SupabaseLedger, supabaseAdmin } from "./supabase";

/**
 * The render worker. Runs on the Hetzner server (see deploy/).
 *
 * The website creates jobs (and charges credits) in Postgres. This loop
 * claims ready jobs one at a time per slot, makes the voice and the AI clip,
 * renders the captioned video with FFmpeg and marks the job done. Any
 * failure refunds the job, and jobs waiting on it, in the database.
 *
 * Steps are resumable: the voice and clip keys are saved as soon as they
 * exist, so a job picked up again after a crash doesn't pay for them twice.
 */

/** A job row as the worker sees it. */
export interface QueuedJob {
  id: string;
  user_id: string;
  project_id: string | null;
  language: string;
  request: Record<string, unknown>;
  depends_on: string | null;
  attempts: number;
  clip_key: string | null;
  voice_key: string | null;
  batch_id?: string | null;
}

/** Who to email when a generation finishes, and what to say. */
export interface NotifyTarget {
  to: string;
  name?: string;
  title: string;
  videos: { language: string; ok: boolean }[];
}

/**
 * This worker no longer holds the job: it went quiet long enough for another
 * worker to claim it, or the reaper failed and refunded it. Leave it alone.
 */
export class JobLostError extends Error {
  constructor(jobId: string) {
    super(`job ${jobId} is no longer held by this worker`);
    this.name = "JobLostError";
  }
}

/** The job ran past its deadline (e.g. a provider call that never answered). */
export class JobTimeoutError extends Error {
  constructor(ms: number) {
    super(`job timed out after ${Math.round(ms / 1000)}s`);
    this.name = "JobTimeoutError";
  }
}

export const DEFAULT_JOB_TIMEOUT_MS = 15 * 60_000;

/** Everything the worker needs from the database. */
export interface Queue {
  claim(workerId: string): Promise<QueuedJob | undefined>;
  heartbeat(jobId: string, workerId: string): Promise<void>;
  clipKeyOf(jobId: string): Promise<string | undefined>;
  /** Writes only while this worker holds the running job; otherwise throws JobLostError. */
  saveKeys(jobId: string, workerId: string, keys: { clip_key?: string; voice_key?: string }): Promise<void>;
  /** Writes only while this worker holds the running job; otherwise throws JobLostError. */
  succeed(jobId: string, workerId: string, outputKey: string, durationS: number): Promise<void>;
  /** Fails and refunds the job, unless it has finished or another worker has taken it over. */
  fail(jobId: string, workerId: string, message: string): Promise<void>;
  reap(): Promise<number>;
  /** Tell the website this worker is online and which languages it can voice. */
  announce(workerId: string, languages: string[], info: Record<string, unknown>): Promise<void>;
  /** If every job in the batch is done and nobody was told yet, claim the email and return who to send it to. */
  notification?(batchId: string): Promise<NotifyTarget | undefined>;
}

export class SupabaseQueue implements Queue {
  constructor(private readonly db: SupabaseClient) {}

  async claim(workerId: string) {
    const { data, error } = await this.db.rpc("claim_job", { p_worker: workerId });
    if (error) throw error;
    const rows = (data ?? []) as QueuedJob[];
    return rows[0];
  }
  async heartbeat(jobId: string, workerId: string) {
    await this.db.from("jobs").update({ heartbeat_at: new Date().toISOString() }).eq("id", jobId).eq("locked_by", workerId);
  }
  async clipKeyOf(jobId: string) {
    const { data, error } = await this.db.from("jobs").select("clip_key").eq("id", jobId).maybeSingle();
    if (error) throw error;
    return (data?.clip_key as string | null) ?? undefined;
  }
  async saveKeys(jobId: string, workerId: string, keys: { clip_key?: string; voice_key?: string }) {
    await this.updateHeld(jobId, workerId, keys);
  }
  async succeed(jobId: string, workerId: string, outputKey: string, durationS: number) {
    await this.updateHeld(jobId, workerId, {
      status: "succeeded", output_key: outputKey, duration_s: durationS, current_step: null, finished_at: new Date().toISOString(),
    });
  }
  async fail(jobId: string, workerId: string, message: string) {
    const { error } = await this.db.rpc("fail_job", { p_job: jobId, p_error: message, p_worker: workerId });
    if (error) throw error;
  }
  /** Update the job only if this worker still holds it and it is still running. */
  private async updateHeld(jobId: string, workerId: string, values: Record<string, unknown>) {
    const { data, error } = await this.db
      .from("jobs").update(values)
      .eq("id", jobId).eq("locked_by", workerId).eq("status", "running")
      .select("id");
    if (error) throw error;
    if (!data?.length) throw new JobLostError(jobId);
  }
  async reap() {
    const { data, error } = await this.db.rpc("reap_stale_jobs");
    if (error) throw error;
    return (data as number) ?? 0;
  }
  async notification(batchId: string): Promise<NotifyTarget | undefined> {
    const { data: userId, error } = await this.db.rpc("claim_batch_notification", { p_batch: batchId });
    if (error) throw error;
    if (!userId) return undefined;
    const [{ data: jobs }, { data: profile }, { data: auth }] = await Promise.all([
      this.db.from("jobs").select("language, status, projects(title)").eq("batch_id", batchId),
      this.db.from("profiles").select("display_name, email_updates").eq("id", userId).maybeSingle(),
      this.db.auth.admin.getUserById(userId as string),
    ]);
    const email = auth?.user?.email;
    if (!email || profile?.email_updates === false || !jobs?.length) return undefined;
    const project = jobs[0]!.projects as { title?: string } | { title?: string }[] | null;
    const title = (Array.isArray(project) ? project[0]?.title : project?.title) ?? "your video";
    const meta = auth.user?.user_metadata ?? {};
    return {
      to: email,
      name: (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? (profile?.display_name as string | undefined),
      title,
      videos: jobs.map((j) => ({ language: j.language as string, ok: j.status === "succeeded" })),
    };
  }
  async announce(workerId: string, languages: string[], info: Record<string, unknown>) {
    const { error } = await this.db
      .from("worker_status")
      .upsert({ worker_id: workerId, languages, info, seen_at: new Date().toISOString() });
    if (error) throw error;
  }
}

/** Languages this worker can actually voice, given the API keys it has. */
export function availableLanguages(deps: EngineDeps): LanguageCode[] {
  return (Object.keys(LANGUAGES) as LanguageCode[]).filter(
    (l) => deps.voices.plan(l, "female").length > 0 || deps.voices.plan(l, "male").length > 0,
  );
}

const FIELDS = ["imageKey", "script", "gender", "motionPrompt", "videoDurationS", "aspect", "watermark", "headline", "brandName", "cta", "captionStyle", "design"] as const;

/** Rebuild a pipeline request from the stored job. The user and language always come from the row, not the JSON. */
export function requestFromJob(job: QueuedJob): ShortRequest {
  if (!isLanguageCode(job.language)) throw new InvalidRequestError(`Unsupported language: ${job.language}`);
  const r = job.request ?? {};
  const picked = Object.fromEntries(FIELDS.filter((f) => r[f] !== undefined && r[f] !== null).map((f) => [f, r[f]]));
  const req = { ...picked, userId: job.user_id, projectId: job.project_id ?? undefined, language: job.language as LanguageCode } as ShortRequest;
  if (typeof req.imageKey !== "string" || !req.imageKey.startsWith(`users/${job.user_id}/uploads/`)) {
    throw new InvalidRequestError("The photo for this video is missing.");
  }
  if (req.gender !== "female" && req.gender !== "male") req.gender = "female";
  if (req.videoDurationS !== 10) req.videoDurationS = 5;
  if (req.captionStyle !== "box") req.captionStyle = "pop";
  req.design = cleanDesign(r.design);
  return req;
}

/** What the user sees when a job fails. Internal details stay in the logs. */
export function userMessage(err: unknown): string {
  if (err instanceof InvalidRequestError) return `${err.message} Your credits were refunded.`;
  if (err instanceof JobTimeoutError) return "This video took too long to make. Your credits were refunded, so please try again.";
  return "Something went wrong while making this video. Your credits were refunded, so please try again.";
}

export interface ProcessOptions {
  workerId: string;
  heartbeatMs?: number;
  /** After this long the job fails and is refunded, whatever it is waiting on. */
  timeoutMs?: number;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  /** Called after a job finishes (either way); sends the "ready" email when the whole batch is done. */
  notify?: (job: QueuedJob) => Promise<void>;
}

/**
 * Make one video. Never throws: success or a refunded failure is written to the queue.
 * "lost" means another worker (or the reaper) took the job over, so this one leaves it alone.
 */
export async function processJob(job: QueuedJob, queue: Queue, deps: EngineDeps, opts: ProcessOptions): Promise<"succeeded" | "failed" | "lost"> {
  const log = opts.log ?? (() => {});
  const beat = setInterval(() => { queue.heartbeat(job.id, opts.workerId).catch(() => {}); }, opts.heartbeatMs ?? 30_000);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new JobTimeoutError(timeoutMs)), timeoutMs);
  const t0 = Date.now();
  try {
    await untilAborted(makeVideo(job, queue, deps, opts.workerId, deadline.signal), deadline.signal);
    log("job succeeded", { job: job.id, language: job.language, seconds: Math.round((Date.now() - t0) / 1000) });
    await notifySafely(job, opts);
    return "succeeded";
  } catch (err) {
    if (err instanceof JobLostError) {
      log("job taken over elsewhere, leaving it", { job: job.id, language: job.language });
      return "lost";
    }
    log("job failed", { job: job.id, language: job.language, error: err instanceof Error ? err.message : String(err) });
    try {
      await queue.fail(job.id, opts.workerId, userMessage(err));
    } catch (e) {
      // If even this fails, the stale-job reaper refunds it later.
      log("could not mark job failed", { job: job.id, error: e instanceof Error ? e.message : String(e) });
    }
    await notifySafely(job, opts);
    return "failed";
  } finally {
    clearTimeout(timer);
    clearInterval(beat);
  }
}

/** Voice + clip in parallel, then render, then mark done. Stops between steps once the deadline passes. */
async function makeVideo(job: QueuedJob, queue: Queue, deps: EngineDeps, workerId: string, signal: AbortSignal): Promise<void> {
  const req = requestFromJob(job);
  const mod = await deps.moderator.checkScript(req.script ?? "");
  if (!mod.ok) throw new InvalidRequestError(mod.reason);

  // Extra languages reuse the first language's clip.
  let videoKey = job.clip_key ?? undefined;
  if (!videoKey && job.depends_on) {
    videoKey = await queue.clipKeyOf(job.depends_on);
    if (!videoKey) throw new Error(`lead job ${job.depends_on} has no clip`);
  }
  if (!videoKey && deps.moderator.checkImage) {
    const photo = await deps.moderator.checkImage(await deps.storage.get(req.imageKey));
    if (!photo.ok) throw new InvalidRequestError(photo.reason);
  }
  if (!job.voice_key && deps.voices.plan(req.language, req.gender).length === 0) {
    throw new InvalidRequestError(`No voice is available for ${req.language} yet.`);
  }
  const run: ShortRequest = { ...req, reuse: { videoKey, voiceKey: job.voice_key ?? undefined } };

  const [voiceKey, clipKey] = await Promise.all([
    stepVoice(job.id, run, deps).then(async (k) => { if (!job.voice_key) await queue.saveKeys(job.id, workerId, { voice_key: k }); return k; }),
    stepVideo(job.id, run, deps, signal).then(async (k) => { if (!job.clip_key) await queue.saveKeys(job.id, workerId, { clip_key: k }); return k; }),
  ]);
  signal.throwIfAborted();
  const out = await stepRender(job.id, run, voiceKey, clipKey, deps);
  signal.throwIfAborted();
  await queue.succeed(job.id, workerId, out.outputKey, out.durationS);
}

/**
 * Settles with `work`, or rejects with the abort reason as soon as `signal` fires.
 * Work still running after the deadline is left to finish on its own; its writes
 * are refused (JobLostError) because the job is no longer running.
 */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  work.catch(() => {}); // a late failure after the deadline is already handled
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    work.then(resolve, reject);
  });
}

async function notifySafely(job: QueuedJob, opts: ProcessOptions) {
  // Edits from the canvas are quick re-renders; no email for those.
  if (!opts.notify || (job.request as { editOf?: string })?.editOf) return;
  try {
    await opts.notify(job);
  } catch (err) {
    opts.log?.("ready email failed", { job: job.id, error: err instanceof Error ? err.message : String(err) });
  }
}

/** Build the notify hook: claim the batch's email, then send it with Resend. */
export function emailNotifier(queue: Queue, send: (t: NotifyTarget) => Promise<void>): ProcessOptions["notify"] {
  if (!queue.notification) return undefined;
  return async (job) => {
    if (!job.batch_id) return;
    const target = await queue.notification!(job.batch_id);
    if (target) await send(target);
  };
}

export interface WorkerHandle {
  stop(): Promise<void>;
}

/** Run `concurrency` claim-and-process loops until stopped. */
export function startWorker(
  queue: Queue, deps: EngineDeps,
  o: { workerId: string; concurrency: number; pollMs: number; jobTimeoutMs?: number; info?: Record<string, unknown>; log?: ProcessOptions["log"]; notify?: ProcessOptions["notify"] },
): WorkerHandle {
  const log = o.log ?? (() => {});
  let stopping = false;
  const languages = availableLanguages(deps);
  const announce = () => queue.announce(o.workerId, languages, o.info ?? {}).catch((e) => log("announce failed", { error: String(e?.message ?? e) }));
  void announce();
  const announcer = setInterval(announce, 30_000);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function slot(n: number) {
    while (!stopping) {
      let job: QueuedJob | undefined;
      try {
        job = await queue.claim(o.workerId);
      } catch (err) {
        log("claim failed", { slot: n, error: err instanceof Error ? err.message : String(err) });
        await sleep(o.pollMs * 3);
        continue;
      }
      if (!job) { await sleep(o.pollMs); continue; }
      log("job claimed", { slot: n, job: job.id, language: job.language, attempt: job.attempts });
      await processJob(job, queue, deps, { workerId: o.workerId, timeoutMs: o.jobTimeoutMs, log, notify: o.notify });
    }
  }

  const reaper = setInterval(() => {
    queue.reap().then((n) => { if (n) log("reaped stale jobs", { count: n }); }).catch(() => {});
  }, 60_000);
  const slots = Array.from({ length: o.concurrency }, (_, i) => slot(i + 1));
  return {
    async stop() {
      stopping = true;
      clearInterval(reaper);
      clearInterval(announcer);
      await Promise.all(slots);
    },
  };
}

async function main() {
  const config = loadConfig();
  // Real customers pay for these videos: never fall back to test voices silently.
  if (config.AYIKO_PROVIDER_MODE === "auto") {
    throw new Error("On the server set AYIKO_PROVIDER_MODE=live (or =mock to test the queue without API calls).");
  }
  const paths = { ffmpeg: config.FFMPEG_PATH, ffprobe: config.FFPROBE_PATH };
  const db = supabaseAdmin(config);
  const { voices, video, summary } = buildProviders(config, paths);
  const deps: EngineDeps = {
    voices, video, paths,
    storage: buildStorage(config, db),
    ledger: new SupabaseLedger(db),
    jobs: new SupabaseJobStore(db),
    moderator: buildModerator(config.OPENAI_API_KEY, (m) => console.log(JSON.stringify({ t: new Date().toISOString(), msg: m }))),
    captionFont: config.CAPTION_FONT,
  };
  const workerId = config.WORKER_ID ?? `${hostname()}-${process.pid}`;
  const log = (msg: string, extra?: Record<string, unknown>) =>
    console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));

  log("worker starting", { workerId, concurrency: config.WORKER_CONCURRENCY, storage: config.STORAGE, providers: summary });
  if (config.STORAGE === "local") log("warning: STORAGE=local, the website can't show these videos. Set STORAGE=supabase.");

  const queue = new SupabaseQueue(db);
  const notify = config.RESEND_API_KEY
    ? emailNotifier(queue, async (t) => {
        await sendWithResend(config.RESEND_API_KEY!, config.EMAIL_FROM, t.to, renderReadyEmail({ ...t, siteUrl: config.SITE_URL }));
        log("ready email sent", { videos: t.videos.length });
      })
    : undefined;
  if (!notify) log("ready emails off: set RESEND_API_KEY to turn them on");
  const handle = startWorker(queue, deps, {
    workerId, concurrency: config.WORKER_CONCURRENCY, pollMs: config.WORKER_POLL_MS, jobTimeoutMs: config.WORKER_JOB_TIMEOUT_MS, log, notify,
    info: { providers: summary, mode: config.AYIKO_PROVIDER_MODE, moderation: config.OPENAI_API_KEY ? "openai" : "basic", email: Boolean(notify) },
  });
  const shutdown = async (sig: string) => {
    log("stopping after current jobs finish", { signal: sig });
    await handle.stop();
    log("worker stopped");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
