import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MediaBytes } from "./providers/types";

export interface FfmpegPaths {
  ffmpeg: string;
  ffprobe: string;
}

export const DEFAULT_FFMPEG: FfmpegPaths = { ffmpeg: "ffmpeg", ffprobe: "ffprobe" };

/** Run a command and resolve with stdout; reject with the stderr tail on failure. */
export function run(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs ?? 300_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} exited ${code}: ${err.split("\n").slice(-6).join("\n")}`));
    });
  });
}

/** A scratch directory that is always cleaned up. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "ayiko-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function probeDuration(file: string, paths: FfmpegPaths = DEFAULT_FFMPEG): Promise<number> {
  const out = await run(paths.ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  const d = Number.parseFloat(out.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`could not read duration of ${file}`);
  return d;
}

/**
 * Turn provider audio (any format, possibly several segments) into one
 * 44.1 kHz mono MP3 with loudness normalised for social video.
 */
export async function normaliseAudio(
  segments: MediaBytes[],
  paths: FfmpegPaths = DEFAULT_FFMPEG,
): Promise<{ audio: MediaBytes; durationS: number }> {
  return withTempDir(async (dir) => {
    const inputs: string[] = [];
    for (const [i, seg] of segments.entries()) {
      const f = join(dir, `in${i}.${seg.ext}`);
      await writeFile(f, seg.bytes);
      inputs.push(f);
    }
    const args = ["-y", "-hide_banner", "-loglevel", "error"];
    for (const f of inputs) args.push("-i", f);
    const concat = inputs.map((_, i) => `[${i}:a]`).join("") + `concat=n=${inputs.length}:v=0:a=1[cat]`;
    args.push(
      "-filter_complex", `${concat};[cat]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100[a]`,
      "-map", "[a]", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "160k", join(dir, "out.mp3"),
    );
    await run(paths.ffmpeg, args);
    const durationS = await probeDuration(join(dir, "out.mp3"), paths);
    return { audio: { bytes: await readFile(join(dir, "out.mp3")), mime: "audio/mpeg", ext: "mp3" }, durationS };
  });
}

export async function readMedia(file: string): Promise<MediaBytes> {
  const ext = (file.split(".").pop() ?? "bin").toLowerCase();
  const mime =
    ext === "png" ? "image/png" :
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
    ext === "webp" ? "image/webp" :
    ext === "mp4" ? "video/mp4" :
    ext === "mp3" ? "audio/mpeg" :
    ext === "wav" ? "audio/wav" : "application/octet-stream";
  return { bytes: await readFile(file), mime, ext };
}
