/**
 * Run the Ayiko engine end to end on your machine.
 *
 *   npm run demo                                   # mock mode, sample image, Twi then English
 *   npm run demo -- --lang yo --gender male --script "..." --image ./photo.jpg
 *   npm run demo -- --live                         # real providers (needs keys in .env)
 */
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "./config";
import { InMemoryLedger, PRICES } from "./credits";
import { InMemoryJobStore } from "./jobs";
import { isLanguageCode, LANGUAGES, type Gender } from "./languages";
import { readMedia, run } from "./media";
import { BasicModerator } from "./moderation";
import { runCaptionedShort, type EngineDeps } from "./pipeline";
import { buildProviders } from "./providers";
import { keys, LocalStorage } from "./storage";

const SAMPLE_SCRIPTS: Record<string, string> = {
  twi: "Akwaaba! Ntoma foforo aba. Bra bɛhwɛ yɛn ntoma fɛfɛ no nnɛ.",
  en: "Welcome! New fabrics just landed. Come and see our beautiful cloth today.",
  yo: "Ẹ káàbọ̀! Aṣọ tuntun ti dé. Ẹ wá wo àwọn aṣọ wa lónìí.",
  pcm: "Welcome o! New cloth don land. Come check am today.",
};

async function main() {
  const { values } = parseArgs({
    options: {
      lang: { type: "string", default: "twi" },
      gender: { type: "string", default: "female" },
      script: { type: "string" },
      image: { type: "string" },
      remix: { type: "string", default: "en" },
      out: { type: "string", default: "./out" },
      live: { type: "boolean", default: false },
    },
  });

  if (!isLanguageCode(values.lang!)) throw new Error(`Unknown language "${values.lang}". Try: ${Object.keys(LANGUAGES).join(", ")}`);
  const gender = (values.gender === "male" ? "male" : "female") as Gender;

  const config = loadConfig({ ...process.env, AYIKO_PROVIDER_MODE: values.live ? "live" : process.env.AYIKO_PROVIDER_MODE });
  const paths = { ffmpeg: config.FFMPEG_PATH, ffprobe: config.FFPROBE_PATH };
  const { voices, video } = buildProviders(config, paths);
  const storage = new LocalStorage(config.LOCAL_STORAGE_DIR);
  const ledger = new InMemoryLedger();
  const jobs = new InMemoryJobStore();
  const deps: EngineDeps = { voices, video, storage, ledger, jobs, moderator: new BasicModerator(), paths, captionFont: config.CAPTION_FONT };

  const userId = "demo-user";
  await ledger.grant(userId, 20, "signup_bonus");
  console.log(`\nAyiko engine · ${config.AYIKO_PROVIDER_MODE} mode · start balance ${await ledger.balance(userId)} credits`);

  // 1. Upload
  const imagePath = values.image ? resolve(values.image) : await makeSampleImage(config.FFMPEG_PATH);
  const image = await readMedia(imagePath);
  const imageKey = await storage.put(keys.upload(userId, `product.${image.ext}`), image);

  // 2. First video
  const script = values.script ?? SAMPLE_SCRIPTS[values.lang!] ?? SAMPLE_SCRIPTS.en!;
  console.log(`\n▶ ${LANGUAGES[values.lang!].name} short: "${script}"`);
  const first = await runCaptionedShort(
    { userId, imageKey, script, language: values.lang!, gender, watermark: true, motionPrompt: "slow push-in on the fabric, gentle movement" },
    deps,
  );
  report(first.quote.lines, first.quote.total, first.balanceAfter, first.durationS);

  // 3. Remix: same clip, new language. Only the voice and render are charged.
  const remixLang = values.remix!;
  let remixKey: string | undefined;
  if (isLanguageCode(remixLang) && remixLang !== values.lang) {
    const remixScript = SAMPLE_SCRIPTS[remixLang] ?? SAMPLE_SCRIPTS.en!;
    console.log(`\n▶ Remix in ${LANGUAGES[remixLang].name}, reusing the clip: "${remixScript}"`);
    const remix = await runCaptionedShort(
      { userId, imageKey, script: remixScript, language: remixLang, gender, watermark: true, reuse: { videoKey: first.videoKey } },
      deps,
    );
    report(remix.quote.lines, remix.quote.total, remix.balanceAfter, remix.durationS);
    remixKey = remix.outputKey;
  }

  // 4. Copy outputs somewhere easy to find
  const outDir = resolve(values.out!);
  await mkdir(outDir, { recursive: true });
  const outputs = [[first.outputKey, `ayiko-${values.lang}.mp4`], ...(remixKey ? [[remixKey, `ayiko-${remixLang}-remix.mp4`]] : [])];
  for (const [key, name] of outputs) await copyFile(resolve(config.LOCAL_STORAGE_DIR, key!), join(outDir, name!));

  console.log("\nProvider calls logged:");
  for (const g of jobs.generations) {
    console.log(`  ${g.step.padEnd(7)} ${g.provider.padEnd(11)} ${g.status.padEnd(9)} ${String(g.latencyMs ?? "").padStart(6)} ms${g.voiceId ? `  voice=${g.voiceId}` : ""}`);
  }
  console.log(`\nFinal balance: ${await ledger.balance(userId)} credits (prices: voice ${PRICES.voicePer30s}/30s, clip ${PRICES.video5s}/5s, render ${PRICES.render})`);
  console.log(`Videos saved in ${outDir}\n`);
}

function report(lines: { item: string; credits: number }[], total: number, balance: number, durationS: number) {
  for (const l of lines) console.log(`  ${l.item.padEnd(28)} ${String(l.credits).padStart(3)} credits`);
  console.log(`  ${"Charged".padEnd(28)} ${String(total).padStart(3)} credits · balance ${balance} · video ${durationS}s`);
}

async function makeSampleImage(ffmpeg: string): Promise<string> {
  const file = resolve("samples/sample-fabric.png");
  if (existsSync(file)) return file;
  await mkdir("samples", { recursive: true });
  // A striped "kente-style" cloth on a plain backdrop, so the demo has something to animate.
  await run(ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=0x2A1F4A:s=1080x1350:d=1",
    "-vf",
    "drawbox=x=240:y=300:w=600:h=750:color=0xF2B705:t=fill," +
      "drawbox=x=300:y=300:w=40:h=750:color=0x1E8A5A:t=fill," +
      "drawbox=x=420:y=300:w=60:h=750:color=0xC2412D:t=fill," +
      "drawbox=x=560:y=300:w=24:h=750:color=0x16132A:t=fill," +
      "drawbox=x=660:y=300:w=50:h=750:color=0x1E8A5A:t=fill," +
      "drawbox=x=240:y=520:w=600:h=36:color=0x16132A@0.6:t=fill," +
      "drawbox=x=240:y=800:w=600:h=36:color=0x16132A@0.6:t=fill",
    "-frames:v", "1", file,
  ]);
  return file;
}

main().catch((err) => {
  console.error(`\n✖ ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
