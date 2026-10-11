import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { InMemoryLedger, InsufficientCreditsError } from "../src/credits";
import { InMemoryJobStore } from "../src/jobs";
import { BasicModerator } from "../src/moderation";
import { InvalidRequestError, runCaptionedShort, type EngineDeps } from "../src/pipeline";
import { MockVideoProvider } from "../src/providers/mock";
import { ProviderError, type SpeechRequest, type SpeechResult, type VideoProvider, type VoiceProvider } from "../src/providers/types";
import { VoiceRouter } from "../src/router";
import { LocalStorage } from "../src/storage";
import { run } from "../src/media";

const config = loadConfig({});

/** A fake voice provider that can be told to fail. */
class FakeVoice implements VoiceProvider {
  calls: SpeechRequest[] = [];
  constructor(readonly id: string, private readonly fail = false) {}
  async synthesize(req: SpeechRequest): Promise<SpeechResult> {
    this.calls.push(req);
    if (this.fail) throw new ProviderError(this.id, "HTTP 503: down", 503);
    const dir = await mkdtemp(join(tmpdir(), "fv-"));
    const f = join(dir, "v.mp3");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=duration=2", "-c:a", "libmp3lame", f]);
    const { readFile } = await import("node:fs/promises");
    return { bytes: await readFile(f), mime: "audio/mpeg", ext: "mp3", provider: this.id, voiceId: req.voiceId };
  }
}

class BrokenVideo implements VideoProvider {
  readonly id = "broken-video";
  async imageToVideo(): Promise<never> {
    throw new ProviderError(this.id, "model overloaded", 503);
  }
}

async function setup(overrides: Partial<EngineDeps> = {}) {
  const storage = new LocalStorage(await mkdtemp(join(tmpdir(), "ayiko-test-")));
  const dir = await mkdtemp(join(tmpdir(), "img-"));
  const img = join(dir, "p.png");
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=orange:s=540x960:d=1", "-frames:v", "1", img]);
  const { readFile } = await import("node:fs/promises");
  const imageKey = await storage.put("users/u/uploads/p.png", { bytes: await readFile(img), mime: "image/png", ext: "png" });
  const ledger = new InMemoryLedger();
  await ledger.grant("u", 20, "signup_bonus");
  const jobs = new InMemoryJobStore();
  const deps: EngineDeps = {
    voices: new VoiceRouter({ naijalingo: new FakeVoice("naijalingo"), khaya: new FakeVoice("khaya") }, config),
    video: new MockVideoProvider(),
    storage, ledger, jobs, moderator: new BasicModerator(),
    ...overrides,
  };
  return { deps, imageKey, ledger, jobs };
}

describe("voice routing", () => {
  it("uses the first provider for the language", async () => {
    const nl = new FakeVoice("naijalingo");
    const router = new VoiceRouter({ naijalingo: nl, khaya: new FakeVoice("khaya") }, config);
    const { result } = await router.synthesize("Ẹ káàbọ̀!", "yo", "male");
    expect(result.provider).toBe("naijalingo");
    expect(nl.calls[0]!.voiceId).toBe("adekunle_yo");
  });

  it("falls back when the first provider fails", async () => {
    const router = new VoiceRouter({ naijalingo: new FakeVoice("naijalingo", true), khaya: new FakeVoice("khaya") }, config);
    const { result, attempts } = await router.synthesize("Ẹ káàbọ̀!", "yo", "female");
    expect(result.provider).toBe("khaya");
    expect(attempts.map((a) => a.ok)).toEqual([false, true]);
  });

  it("skips providers with no key", () => {
    const router = new VoiceRouter({ khaya: new FakeVoice("khaya") }, config);
    expect(router.plan("pcm", "female")).toHaveLength(0);
    expect(router.plan("twi", "female")[0]!.provider.id).toBe("khaya");
  });
});

describe("runCaptionedShort", () => {
  it("makes a video and charges 13 credits", async () => {
    const { deps, imageKey, ledger, jobs } = await setup();
    const res = await runCaptionedShort({ userId: "u", imageKey, script: "Akwaaba! Ntoma foforo aba.", language: "twi", gender: "female" }, deps);
    expect(res.quote.total).toBe(13);
    expect(await ledger.balance("u")).toBe(7);
    expect((await deps.storage.get(res.outputKey)).bytes.length).toBeGreaterThan(10_000);
    expect((await jobs.get(res.jobId))!.status).toBe("succeeded");
  }, 60_000);

  it("refunds in full when a provider fails", async () => {
    const { deps, imageKey, ledger, jobs } = await setup({ video: new BrokenVideo() });
    await expect(
      runCaptionedShort({ userId: "u", imageKey, script: "Akwaaba!", language: "twi", gender: "female" }, deps),
    ).rejects.toThrow(/model overloaded/);
    expect(await ledger.balance("u")).toBe(20);
    const job = [...jobs.jobs.values()][0]!;
    expect(job.status).toBe("failed");
    expect(jobs.generations.find((g) => g.step === "video")!.status).toBe("failed");
  }, 60_000);

  it("refuses before charging when credits are short", async () => {
    const { deps, imageKey, ledger } = await setup();
    await ledger.spend("u", 15, "earlier-job");
    await expect(
      runCaptionedShort({ userId: "u", imageKey, script: "Akwaaba!", language: "twi", gender: "female" }, deps),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(await ledger.balance("u")).toBe(5);
  });

  it("rejects a language with no configured voice", async () => {
    const { deps, imageKey } = await setup({ voices: new VoiceRouter({}, config) });
    await expect(
      runCaptionedShort({ userId: "u", imageKey, script: "Hello", language: "en", gender: "female" }, deps),
    ).rejects.toBeInstanceOf(InvalidRequestError);
  });
});

describe("runLanguageMultiplier", () => {
  it("makes one clip and charges extra languages only for voice and render", async () => {
    const { runLanguageMultiplier } = await import("../src/pipeline");
    const { deps, imageKey, ledger, jobs } = await setup();
    await ledger.grant("u", 10, "admin"); // 30 total
    const results = await runLanguageMultiplier(
      { userId: "u", imageKey, gender: "female" },
      [
        { language: "twi", script: "Akwaaba!" },
        { language: "yo", script: "Ẹ káàbọ̀!" },
        { language: "pcm", script: "Welcome o!" },
      ],
      deps,
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await ledger.balance("u")).toBe(30 - (13 + 3 + 3));
    expect(jobs.generations.filter((g) => g.step === "video")).toHaveLength(1);
    const keys = results.map((r) => (r.ok ? r.videoKey : ""));
    expect(new Set(keys).size).toBe(1);
  }, 90_000);

  it("refunds only the language whose voice fails", async () => {
    const { runLanguageMultiplier } = await import("../src/pipeline");
    const voices = new VoiceRouter({ khaya: new FakeVoice("khaya"), naijalingo: new FakeVoice("naijalingo", true) }, config);
    const { deps, imageKey, ledger } = await setup({ voices });
    const results = await runLanguageMultiplier(
      { userId: "u", imageKey, gender: "female" },
      [{ language: "twi", script: "Akwaaba!" }, { language: "pcm", script: "Welcome o!" }],
      deps,
    );
    expect(results.map((r) => r.ok)).toEqual([true, false]);
    expect(await ledger.balance("u")).toBe(20 - 13);
  }, 90_000);
});
