import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_FFMPEG, run, withTempDir, type FfmpegPaths } from "../media";
import type {
  ImageToVideoRequest, SpeechRequest, SpeechResult, VideoProvider, VideoResult, VoiceProvider,
} from "./types";

/**
 * Local stand-ins so the whole pipeline runs with no API keys and no cost.
 * The voice is a soft tone lasting as long as the script would take to read;
 * the video is a slow zoom on the uploaded image.
 */

export function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round((words / 2.5) * 10) / 10); // ~150 words per minute
}

export class MockVoiceProvider implements VoiceProvider {
  constructor(readonly id = "mock-voice", private readonly paths: FfmpegPaths = DEFAULT_FFMPEG) {}

  async synthesize(req: SpeechRequest): Promise<SpeechResult> {
    const seconds = estimateSpeechSeconds(req.text);
    const freq = req.gender === "female" ? 330 : 220;
    return withTempDir(async (dir) => {
      const out = join(dir, "voice.mp3");
      await run(this.paths.ffmpeg, [
        "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${seconds}`,
        "-af", "volume=0.08,afade=t=in:d=0.2,afade=t=out:st=" + Math.max(0, seconds - 0.3) + ":d=0.3",
        "-c:a", "libmp3lame", "-b:a", "96k", out,
      ]);
      return {
        bytes: await readFile(out), mime: "audio/mpeg", ext: "mp3",
        provider: this.id, model: "mock", voiceId: req.voiceId, costUsd: 0,
      };
    });
  }
}

export class MockVideoProvider implements VideoProvider {
  readonly id = "mock-video";
  constructor(private readonly paths: FfmpegPaths = DEFAULT_FFMPEG) {}

  async imageToVideo(req: ImageToVideoRequest): Promise<VideoResult> {
    const frames = req.durationS * 30;
    return withTempDir(async (dir) => {
      const img = join(dir, `in.${req.image.ext}`);
      const out = join(dir, "clip.mp4");
      await writeFile(img, req.image.bytes);
      await run(this.paths.ffmpeg, [
        "-y", "-hide_banner", "-loglevel", "error",
        "-loop", "1", "-i", img,
        "-vf",
        "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1," +
          `zoompan=z='min(zoom+0.0012,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=30`,
        "-frames:v", String(frames), "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", out,
      ]);
      return { bytes: await readFile(out), mime: "video/mp4", ext: "mp4", provider: this.id, model: "mock-zoom", costUsd: 0 };
    });
  }
}
