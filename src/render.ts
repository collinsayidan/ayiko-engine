import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAss, splitPhrases, timeCues, type CaptionStyle, type Cue, type Design } from "./captions";
import { DEFAULT_FFMPEG, probeDuration, run, withTempDir, type FfmpegPaths } from "./media";
import type { MediaBytes } from "./providers/types";

export type AspectRatio = "9:16" | "1:1" | "16:9";

const SIZES: Record<AspectRatio, [number, number]> = {
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "16:9": [1920, 1080],
};

/** Bundled Inter weights; they cover Twi (ɛ ɔ) and Yoruba tone marks. */
export const FONTS_DIR = fileURLToPath(new URL("../assets/fonts/", import.meta.url));

export interface RenderInput {
  video: MediaBytes;
  voice: MediaBytes;
  script: string;
  aspect?: AspectRatio;
  captionStyle?: CaptionStyle;
  headline?: string;
  brand?: string;
  cta?: string;
  watermark?: string;
  design?: Design;
  paths?: FfmpegPaths;
}

export interface RenderOutput {
  video: MediaBytes;
  durationS: number;
  cues: Cue[];
}

const END_CARD_S = 2.2;
const TAIL_S = 0.6;

/**
 * Joins the AI clip, the voiceover and the on-screen design into one MP4:
 * a light colour grade, vignette and fine grain for a filmed look; the clip
 * loops under the voiceover; then a blurred end card with the brand and a
 * call to action. Fades in and out so it loops cleanly on social feeds.
 */
export async function renderShort(input: RenderInput): Promise<RenderOutput> {
  const paths = input.paths ?? DEFAULT_FFMPEG;
  const [w, h] = SIZES[input.aspect ?? "9:16"];

  return withTempDir(async (dir) => {
    await writeFile(join(dir, `clip.${input.video.ext}`), input.video.bytes);
    await writeFile(join(dir, `voice.${input.voice.ext}`), input.voice.bytes);
    await mkdir(join(dir, "fonts"));
    for (const f of await readdir(FONTS_DIR)) {
      if (f.endsWith(".ttf")) await copyFile(join(FONTS_DIR, f), join(dir, "fonts", f));
    }

    const voiceS = await probeDuration(join(dir, `voice.${input.voice.ext}`), paths);
    const hasEndCard = Boolean(input.brand?.trim() || input.cta?.trim());
    const voiceEnd = Math.round((voiceS + 0.25) * 100) / 100;
    const durationS = Math.round((voiceEnd + (hasEndCard ? END_CARD_S : TAIL_S)) * 100) / 100;

    const cues = timeCues(splitPhrases(input.script, input.aspect === "16:9" ? 34 : 20), voiceS);
    const ass = buildAss(cues, {
      width: w, height: h, durationS, voiceEndS: voiceEnd, style: input.captionStyle,
      headline: input.headline, brand: input.brand, cta: input.cta, watermark: input.watermark, design: input.design,
    });
    await writeFile(join(dir, "captions.ass"), ass, "utf8");

    const endFx = hasEndCard
      ? `,boxblur=luma_radius=22:luma_power=2:chroma_radius=22:chroma_power=2:enable='gte(t,${voiceEnd})',eq=brightness=-0.16:enable='gte(t,${voiceEnd})'`
      : "";
    const video =
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,` +
      `eq=contrast=1.06:saturation=1.12:brightness=0.01,vignette=angle=PI/5,noise=alls=4:allf=t` +
      endFx +
      `,fade=t=in:st=0:d=0.35,fade=t=out:st=${(durationS - 0.4).toFixed(2)}:d=0.4` +
      `,ass=captions.ass:fontsdir=fonts[v]`;
    const audio = `[1:a]apad=pad_dur=${(durationS - voiceS + 0.1).toFixed(2)},afade=t=out:st=${(durationS - 0.5).toFixed(2)}:d=0.5[a]`;

    // cwd = dir so filters get plain relative names (no Windows path escaping).
    await run(
      paths.ffmpeg,
      [
        "-y", "-hide_banner", "-loglevel", "error",
        "-stream_loop", "-1", "-i", `clip.${input.video.ext}`,
        "-i", `voice.${input.voice.ext}`,
        "-filter_complex", `${video};${audio}`,
        "-map", "[v]", "-map", "[a]",
        "-t", String(durationS),
        "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
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
