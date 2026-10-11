/**
 * Run the Ayiko engine end to end on your machine.
 *
 *   npm run demo                                   # mock mode: one clip, four languages
 *   npm run demo -- --langs twi,en --template new-arrival --image ./photo.jpg
 *   npm run demo -- --live                         # real providers (needs keys in .env)
 */
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "./config";
import { InMemoryLedger, quoteMultiplier } from "./credits";
import { InMemoryJobStore } from "./jobs";
import { isLanguageCode, LANGUAGES, type Gender } from "./languages";
import { readMedia, run } from "./media";
import { BasicModerator } from "./moderation";
import { runLanguageMultiplier, type EngineDeps } from "./pipeline";
import { buildProviders } from "./providers";
import { keys, LocalStorage } from "./storage";
import { getTemplate, TEMPLATES } from "./templates";

const SAMPLE_SCRIPTS: Record<string, string> = {
  twi: "Akwaaba! Nneɛma foforo aba. Bra bɛtɔ wo de nnɛ.",
  en: "Welcome! New stock just landed. Come and get yours today.",
  yo: "Ẹ káàbọ̀! Ọjà tuntun ti dé. Ẹ wá ra tiyín lónìí.",
  pcm: "Welcome o! New market don land. Come buy your own today.",
};

async function main() {
  const { values } = parseArgs({
    options: {
      langs: { type: "string", default: "twi,en,yo,pcm" },
      template: { type: "string", default: "product-promo" },
      gender: { type: "string" },
      script: { type: "string" },
      image: { type: "string" },
      out: { type: "string", default: "./out" },
      live: { type: "boolean", default: false },
      headline: { type: "string" },
      brand: { type: "string", default: "AMA Glow Serum" },
      cta: { type: "string", default: "Order on WhatsApp" },
    },
  });

  const langs = values.langs!.split(",").map((l) => l.trim()).filter(Boolean);
  for (const l of langs) if (!isLanguageCode(l)) throw new Error(`Unknown language "${l}". Try: ${Object.keys(LANGUAGES).join(", ")}`);
  const template = getTemplate(values.template!);
  if (!template || template.status !== "ready") {
    throw new Error(`Unknown or unreleased template "${values.template}". Ready: ${TEMPLATES.filter((t) => t.status === "ready").map((t) => t.id).join(", ")}`);
  }
  const gender = (values.gender ?? template.defaultGender) as Gender;

  const config = loadConfig({ ...process.env, AYIKO_PROVIDER_MODE: values.live ? "live" : process.env.AYIKO_PROVIDER_MODE });
  const paths = { ffmpeg: config.FFMPEG_PATH, ffprobe: config.FFPROBE_PATH };
  const { voices, video } = buildProviders(config, paths);
  const storage = new LocalStorage(config.LOCAL_STORAGE_DIR);
  const ledger = new InMemoryLedger();
  const jobs = new InMemoryJobStore();
  const deps: EngineDeps = { voices, video, storage, ledger, jobs, moderator: new BasicModerator(), paths, captionFont: config.CAPTION_FONT };

  const userId = "demo-user";
  await ledger.grant(userId, 20, "signup_bonus");
  await ledger.grant(userId, 60, "purchase", "demo-starter-pack"); // the £5 Starter pack
  console.log(`\nAyiko engine · ${config.AYIKO_PROVIDER_MODE} mode · template "${template.name}" · balance ${await ledger.balance(userId)} credits`);

  // 1. Upload
  const imagePath = values.image ? resolve(values.image) : await makeSampleImage(config.FFMPEG_PATH);
  const image = await readMedia(imagePath);
  const imageKey = await storage.put(keys.upload(userId, `product.${image.ext}`), image);

  // 2. Language Multiplier: one clip, every language
  const items = langs.map((language) => ({
    language: language as keyof typeof LANGUAGES,
    script: (langs.length === 1 && values.script) || SAMPLE_SCRIPTS[language] || SAMPLE_SCRIPTS.en!,
  }));
  const quote = quoteMultiplier(items.map((i) => i.script), template.videoDurationS);
  console.log(`\n▶ Language Multiplier: ${langs.map((l) => LANGUAGES[l as keyof typeof LANGUAGES].name).join(", ")}`);
  report(quote.lines, quote.total);

  const results = await runLanguageMultiplier(
    {
      userId, imageKey, gender, watermark: true,
      motionPrompt: template.motionPrompt, videoDurationS: template.videoDurationS, aspect: template.aspect,
      headline: values.headline ?? template.headline, brandName: values.brand, cta: values.cta,
    },
    items,
    deps,
  );

  // 3. Copy outputs somewhere easy to find
  const outDir = resolve(values.out!);
  await mkdir(outDir, { recursive: true });
  console.log("\nResults:");
  for (const r of results) {
    if (!r.ok) {
      console.log(`  ✖ ${r.language.padEnd(4)} ${r.error} (not charged)`);
      continue;
    }
    const name = `ayiko-${r.language}.mp4`;
    await copyFile(resolve(config.LOCAL_STORAGE_DIR, r.outputKey), join(outDir, name));
    console.log(`  ✓ ${r.language.padEnd(4)} ${name.padEnd(16)} ${r.durationS}s · ${r.quote.total} credits`);
  }

  console.log("\nProvider calls logged:");
  for (const g of jobs.generations) {
    console.log(`  ${g.step.padEnd(7)} ${g.provider.padEnd(11)} ${g.status.padEnd(9)} ${String(g.latencyMs ?? "").padStart(6)} ms${g.voiceId ? `  voice=${g.voiceId}` : ""}`);
  }
  console.log(`\nFinal balance: ${await ledger.balance(userId)} credits · videos in ${outDir}\n`);
}

function report(lines: { item: string; credits: number }[], total: number) {
  for (const l of lines) console.log(`  ${l.item.padEnd(30)} ${String(l.credits).padStart(3)} credits`);
  console.log(`  ${"Total".padEnd(30)} ${String(total).padStart(3)} credits (vs ${lines.length * 13} without reuse)`);
}

async function makeSampleImage(ffmpeg: string): Promise<string> {
  const bundled = resolve("samples/sample-product.jpg"); // rendered by scripts/make-sample.py
  if (existsSync(bundled)) return bundled;
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
