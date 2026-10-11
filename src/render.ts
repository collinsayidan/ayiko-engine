import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildAss, splitPhrases, timeCues, type Cue } from "./captions";
import { DEFAULT_FFMPEG, probeDuration, run, withTempDir, type FfmpegPaths } from "./media";
import type { MediaBytes } from "./providers/types";

export type AspectRatio = "9:16" | "1:1" | "16:9";

const SIZES: Record<AspectRatio, [number, number]> = {
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "16:9": [1920, 1080],
};

export interface RenderInput {
  video: MediaBytes;
  voice: MediaBytes;
  script: string;
  aspect?: AspectRatio;
  font?: string;
  watermark?: string;
  paths?: FfmpegPaths;
}

export interface RenderOutput {
  video: MediaBytes;
  durationS: number;
  cues: Cue[];
}

/**
 * Joins the AI clip, the voiceover and the captions into one MP4.
 * The clip loops to cover the voiceover, then holds for a short tail.
 */
export async function renderShort(input: RenderInput): Promise<RenderOutput> {
  const paths = input.paths ?? DEFAULT_FFMPEG;
  const [w, h] = SIZES[input.aspect ?? "9:16"];
  const tailS = 0.6;

  return withTempDir(async (dir) => {
    await writeFile(join(dir, `clip.${input.video.ext}`), input.video.bytes);
    await writeFile(join(dir, `voice.${input.voice.ext}`), input.voice.bytes);

    const voiceS = await probeDuration(join(dir, `voice.${input.voice.ext}`), paths);
    const durationS = Math.round((voiceS + tailS) * 100) / 100;
    const cues = timeCues(splitPhrases(input.script, input.aspect === "16:9" ? 42 : 28), voiceS);
    const ass = buildAss(cues, { width: w, height: h, font: input.font, durationS, watermark: input.watermark });
    await writeFile(join(dir, "captions.ass"), ass, "utf8");

    // cwd = dir so the ass filter gets a plain relative filename (no path escaping).
    await run(
      paths.ffmpeg,
      [
        "-y", "-hide_banner", "-loglevel", "error",
        "-stream_loop", "-1", "-i", `clip.${input.video.ext}`,
        "-i", `voice.${input.voice.ext}`,
        "-filter_complex",
        `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,ass=captions.ass[v];` +
          `[1:a]apad=pad_dur=${tailS}[a]`,
        "-map", "[v]", "-map", "[a]",
        "-t", String(durationS),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart",
        "out.mp4",
      ],
      { cwd: dir },
    );

    return {
      video: { bytes: await readFile(join(dir, "out.mp4")), mime: "video/mp4", ext: "mp4" },
      durationS,
      cues,
    };
  });
}
