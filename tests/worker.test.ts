import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { InMemoryLedger } from "../src/credits";
import type { GenerationRecord, JobStore } from "../src/jobs";
import { run } from "../src/media";
import { BasicModerator } from "../src/moderation";
import type { EngineDeps } from "../src/pipeline";
import { buildProviders } from "../src/providers";
import type { VideoProvider } from "../src/providers/types";
import { ProviderError } from "../src/providers/types";
import { LocalStorage } from "../src/storage";
import { emailNotifier, processJob, requestFromJob, startWorker, userMessage, type NotifyTarget, type Queue, type QueuedJob } from "../src/worker";

/** Mirrors the SQL queue functions (tested against Postgres separately). */
class MemoryQueue implements Queue {
  jobs: (QueuedJob & { status: string; output_key?: string; error?: string; refunded?: boolean })[] = [];
  add(j: Partial<QueuedJob> & { id: string }) {
    this.jobs.push({ user_id: "u1", project_id: null, language: "twi", request: {}, depends_on: null, attempts: 0, clip_key: null, voice_key: null, status: "queued", ...j });
  }
  get(id: string) { return this.jobs.find((j) => j.id === id)!; }
  async claim() {
    const j = this.jobs.find((x) => x.status === "queued" && (!x.depends_on || this.get(x.depends_on).status === "succeeded"));
    if (!j) return undefined;
    j.status = "running"; j.attempts += 1;
    return { ...j };
  }
  async heartbeat() {}
  async clipKeyOf(id: string) { return this.get(id).clip_key ?? undefined; }
  async saveKeys(id: string, k: { clip_key?: string; voice_key?: string }) { Object.assign(this.get(id), k); }
  async succeed(id: string, key: string) { Object.assign(this.get(id), { status: "succeeded", output_key: key }); }
  async fail(id: string, msg: string) {
    const j = this.get(id);
    if (j.status === "succeeded") return;
    Object.assign(j, { status: "failed", error: msg, refunded: true });
    for (const d of this.jobs.filter((x) => x.depends_on === id && (x.status === "queued" || x.status === "running"))) await this.fail(d.id, "lead failed");
  }
  async reap() { return 0; }
  announced: string[] = [];
  async announce(_w: string, langs: string[]) { this.announced = langs; }
  notification?: (batch: string) => Promise<NotifyTarget | undefined>;
}

/** In production these writes go to the real job row; here they're recorded. */
class RecordingJobs implements JobStore {
  generations: GenerationRecord[] = [];
  async create(): Promise<never> { throw new Error("worker never creates jobs"); }
  async update() {}
  async addGeneration(g: GenerationRecord) { this.generations.push(g); }
  async get() { return undefined; }
}

class CountingVideo implements VideoProvider {
  calls = 0;
  constructor(private readonly inner: VideoProvider, readonly id = "counting") {}
  async imageToVideo(r: Parameters<VideoProvider["imageToVideo"]>[0]) { this.calls++; return this.inner.imageToVideo(r); }
}

async function setup(video?: (v: VideoProvider) => VideoProvider) {
  const config = loadConfig({ AYIKO_PROVIDER_MODE: "mock" });
  const paths = { ffmpeg: "ffmpeg", ffprobe: "ffprobe" };
  const p = buildProviders(config, paths);
  const storage = new LocalStorage(await mkdtemp(join(tmpdir(), "ayiko-w-")));
  const dir = await mkdtemp(join(tmpdir(), "img-"));
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=teal:s=540x960:d=1", "-frames:v", "1", join(dir, "p.png")]);
  const imageKey = await storage.put("users/u1/uploads/p.png", { bytes: await readFile(join(dir, "p.png")), mime: "image/png", ext: "png" });
  const v = video ? video(p.video) : new CountingVideo(p.video);
  const deps: EngineDeps = { voices: p.voices, video: v, storage, ledger: new InMemoryLedger(), jobs: new RecordingJobs(), moderator: new BasicModerator(), paths };
  return { deps, imageKey, video: v };
}

const req = (imageKey: string, script = "Akwaaba! Nneɛma foforo aba.") => ({ imageKey, script, gender: "female", headline: "New in", brandName: "AMA Glow", cta: "Order now", watermark: true });

describe("render worker", () => {
  it("rebuilds requests from the row, never trusting user/language in the JSON", () => {
    const r = requestFromJob({ id: "j", user_id: "u1", project_id: null, language: "yo", depends_on: null, attempts: 1, clip_key: null, voice_key: null,
      request: { imageKey: "users/u1/uploads/a.png", script: "x", userId: "attacker", language: "en", videoDurationS: 99 } });
    expect(r.userId).toBe("u1");
    expect(r.language).toBe("yo");
    expect(r.videoDurationS).toBe(5);
    expect(() => requestFromJob({ id: "j", user_id: "u1", project_id: null, language: "yo", depends_on: null, attempts: 1, clip_key: null, voice_key: null,
      request: { imageKey: "users/someone-else/uploads/a.png", script: "x" } })).toThrow(/photo/);
  });

  it("makes a video, then extra languages reuse the same clip", async () => {
    const { deps, imageKey, video } = await setup();
    const q = new MemoryQueue();
    q.add({ id: "lead", language: "twi", request: req(imageKey) });
    q.add({ id: "yo", language: "yo", depends_on: "lead", request: req(imageKey, "Ẹ káàbọ̀! Ọ̀jà tuntun ti dé.") });
    q.add({ id: "en", language: "en", depends_on: "lead", request: req(imageKey, "Welcome! New stock just landed.") });

    // Dependents can't start before the lead finishes
    const first = await q.claim();
    expect(first?.id).toBe("lead");
    expect(await q.claim()).toBeUndefined();
    expect(await processJob(first!, q, deps, { workerId: "w" })).toBe("succeeded");

    for (const id of ["yo", "en"]) {
      const j = await q.claim();
      expect(j?.id).toBe(id);
      expect(await processJob(j!, q, deps, { workerId: "w" })).toBe("succeeded");
    }
    expect((video as CountingVideo).calls).toBe(1);
    expect(q.get("yo").clip_key).toBe(q.get("lead").clip_key);
    const out = await deps.storage.get(q.get("en").output_key!);
    expect(out.bytes.length).toBeGreaterThan(10_000);
  }, 120_000);

  it("refunds a failed lead and everything waiting on it, with a friendly message", async () => {
    const broken: VideoProvider = { id: "broken", imageToVideo: async () => { throw new ProviderError("broken", "fal 503 overloaded", 503); } };
    const { deps, imageKey } = await setup(() => broken);
    const q = new MemoryQueue();
    q.add({ id: "lead", request: req(imageKey) });
    q.add({ id: "pcm", language: "pcm", depends_on: "lead", request: req(imageKey) });
    const j = await q.claim();
    expect(await processJob(j!, q, deps, { workerId: "w" })).toBe("failed");
    expect(q.get("lead")).toMatchObject({ status: "failed", refunded: true });
    expect(q.get("lead").error).not.toMatch(/fal|503/);
    expect(q.get("pcm")).toMatchObject({ status: "failed", refunded: true });
  }, 60_000);

  it("rejects blocked scripts and resumes from saved keys after a crash", async () => {
    const { deps, imageKey, video } = await setup();
    const q = new MemoryQueue();
    q.add({ id: "bad", request: req(imageKey, "buy a bomb") });
    const bad = await q.claim();
    await processJob(bad!, q, deps, { workerId: "w" });
    expect(q.get("bad").error).toMatch(/content rules.*refunded/);

    // A job that already has its clip (picked up again after a crash) doesn't pay for it twice
    q.add({ id: "lead", request: req(imageKey) });
    const lead = await q.claim();
    await processJob(lead!, q, deps, { workerId: "w" });
    const calls = (video as CountingVideo).calls;
    q.add({ id: "again", request: req(imageKey), clip_key: q.get("lead").clip_key });
    const again = await q.claim();
    expect(await processJob(again!, q, deps, { workerId: "w" })).toBe("succeeded");
    expect((video as CountingVideo).calls).toBe(calls);
    expect(userMessage(new Error("secret internals"))).not.toMatch(/secret/);
  }, 120_000);

  it("blocks a flagged photo before paying for the clip, and emails once per finished batch", async () => {
    const { deps, imageKey, video } = await setup();
    deps.moderator = { checkScript: async () => ({ ok: true }), checkImage: async () => ({ ok: false, reason: "This photo breaks the Ayiko content rules." }) };
    const q = new MemoryQueue();
    q.add({ id: "p", request: req(imageKey) });
    const j = await q.claim();
    await processJob(j!, q, deps, { workerId: "w" });
    expect(q.get("p").error).toMatch(/photo.*refunded/);
    expect((video as CountingVideo).calls).toBe(0);

    // emails: the notify hook runs after every job; the queue decides when the batch is complete
    const ok = await setup();
    const q2 = new MemoryQueue();
    q2.add({ id: "a", batch_id: "b1", request: req(ok.imageKey) });
    q2.add({ id: "b", batch_id: "b1", language: "en", depends_on: "a", request: req(ok.imageKey, "Welcome!") });
    q2.add({ id: "e", batch_id: "b2", request: { ...req(ok.imageKey), editOf: "a" }, clip_key: null });
    const sent: string[] = [];
    let claimed = false;
    q2.notification = async (batch: string) => {
      const done = q2.jobs.filter((x) => x.batch_id === batch).every((x) => x.status === "succeeded" || x.status === "failed");
      if (!done || claimed) return undefined;
      claimed = true;
      return { to: "ama@example.com", title: "Shea", videos: [] };
    };
    const notify = emailNotifier(q2, async (t) => { sent.push(t.to); });
    for (let i = 0; i < 3; i++) { const x = await q2.claim(); if (x) await processJob(x, q2, ok.deps, { workerId: "w", notify }); }
    expect(sent).toEqual(["ama@example.com"]);
  }, 180_000);

  it("the loop drains the queue and stops cleanly", async () => {
    const { deps, imageKey } = await setup();
    const q = new MemoryQueue();
    q.add({ id: "a", request: req(imageKey) });
    q.add({ id: "b", language: "en", depends_on: "a", request: req(imageKey, "Welcome!") });
    const h = startWorker(q, deps, { workerId: "w", concurrency: 2, pollMs: 50 });
    const t0 = Date.now();
    while (q.jobs.some((j) => j.status !== "succeeded") && Date.now() - t0 < 90_000) await new Promise((r) => setTimeout(r, 100));
    await h.stop();
    expect(q.jobs.map((j) => j.status)).toEqual(["succeeded", "succeeded"]);
    // test voices cover every language
    expect(q.announced).toEqual(expect.arrayContaining(["twi", "yo", "pcm", "en"]));
  }, 120_000);
});
