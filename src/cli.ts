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
  twi: "Akwaaba! Nneɛma foforo aba. Bra bɛtɔ wo de nnɛ.",
  en: "Welcome! New stock just landed. Come and get yours today.",
  yo: "Ẹ káàbọ̀! Ọjà tuntun ti dé. Ẹ wá ra tiyín lónìí.",
  pcm: "Welcome o! New market don land. Come buy your own today.",
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
    { userId, imageKey, script, language: values.lang!, gender, watermark: true, motionPrompt: "slow push-in on the product, soft studio light, gentle reflections" },
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
  const file = resolve("samples/sample-product.png");
  if (existsSync(file)) return file;
  await mkdir("samples", { recursive: true });
  // A neutral product shot (a glass bottle under a studio spotlight) so the demo has something to animate.
  await run(ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "gradients=s=1080x1350:c0=0x3B4FE0:c1=0x141233:type=radial:x0=540:y0=520:x1=540:y1=1350:d=1",
    "-vf",
    "drawbox=x=470:y=330:w=140:h=110:color=0xE6E8F2:t=fill," +   // cap
      "drawbox=x=500:y=440:w=80:h=40:color=0xC9CCE0@0.8:t=fill," + // neck
      "drawbox=x=380:y=480:w=320:h=520:color=0xFFFFFF@0.28:t=fill," + // glass body
      "drawbox=x=400:y=500:w=40:h=480:color=0xFFFFFF@0.45:t=fill," + // highlight
      "drawbox=x=430:y=690:w=220:h=130:color=0xFFFFFF@0.9:t=fill," + // label
      "drawbox=x=480:y=748:w=120:h=8:color=0x2340D9:t=fill," +
      "drawbox=x=330:y=1000:w=420:h=14:color=0x000000@0.35:t=fill",  // shadow
    "-frames:v", "1", file,
  ]);
  return file;
}

main().catch((err) => {
  console.error(`\n✖ ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
