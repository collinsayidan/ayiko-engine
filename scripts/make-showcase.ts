/**
 * Renders the website showcase videos from the sample photos in .showcase-src/
 * (0.png … 5.png, one per template) into web/public/showcase/ as small,
 * muted, looping MP4s with poster images.
 *
 *   npx tsx scripts/make-showcase.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadConfig } from "../src/config";
import { InMemoryLedger } from "../src/credits";
import { InMemoryJobStore } from "../src/jobs";
import type { Gender, LanguageCode } from "../src/languages";
import { readMedia, run, withTempDir } from "../src/media";
import { BasicModerator } from "../src/moderation";
import { runCaptionedShort, runLanguageMultiplier, type EngineDeps } from "../src/pipeline";
import { buildProviders } from "../src/providers";
import { keys, LocalStorage } from "../src/storage";
import { getTemplate } from "../src/templates";

interface Shot {
  slug: string;
  photo: number;
  template: string;
  language: LanguageCode;
  gender: Gender;
  script: string;
  brand: string;
  cta: string;
}

const SHOTS: Shot[] = [
  { slug: "product-promo", photo: 0, template: "product-promo", language: "twi", gender: "female", script: "Akwaaba! Nneɛma foforo aba. Bra bɛtɔ wo de nnɛ.", brand: "AMA Glow Serum", cta: "Order on WhatsApp" },
  { slug: "new-arrival", photo: 1, template: "new-arrival", language: "pcm", gender: "male", script: "E don land! New sneakers don drop. Come early, stock no plenty.", brand: "Kwesi Kicks", cta: "Shop now" },
  { slug: "event-promo", photo: 2, template: "event-promo", language: "en", gender: "male", script: "You're invited! Join us this Saturday at 7pm. Bring a friend.", brand: "Launch Night", cta: "RSVP on WhatsApp" },
  { slug: "church-announcement", photo: 3, template: "church-announcement", language: "yo", gender: "male", script: "Ẹ káàbọ̀! Ìsìn ìdúpẹ́ ní Ọjọ́ Àìkú yìí. Ẹ wá o!", brand: "Grace Chapel", cta: "Sunday · 10am" },
  { slug: "creator-short", photo: 4, template: "creator-short", language: "en", gender: "female", script: "Here's my top tip: save a little from every payday. Small steps add up!", brand: "@amaspeaks", cta: "Follow for more" },
  { slug: "menu-reel", photo: 5, template: "menu-reel", language: "twi", gender: "female", script: "Jollof ne nkokɔ aba! Tɔ wo de nnɛ.", brand: "Mama's Kitchen", cta: "Order now" },
];

/** The same product in six languages, for the Language Multiplier wall. */
const MULTI: { language: LanguageCode; script: string }[] = [
  { language: "twi", script: "Akwaaba! Nneɛma foforo aba." },
  { language: "yo", script: "Ẹ káàbọ̀! Ọ̀jà tuntun ti dé." },
  { language: "pcm", script: "Welcome o! New market don land." },
  { language: "ha", script: "Barka da zuwa! Sabbin kaya sun iso." },
  { language: "en", script: "Welcome! New stock just landed." },
  { language: "fr", script: "Bienvenue ! Les nouveautés sont arrivées." },
];

const SRC = resolve(".showcase-src");
const OUT = resolve("web/public/showcase");

async function webVersion(ffmpeg: string, srcKey: string, storage: LocalStorage, name: string, width: number) {
  const media = await storage.get(srcKey);
  await withTempDir(async (dir) => {
    const inp = join(dir, "in.mp4");
    await writeFile(inp, media.bytes);
    // Small, muted, fast-starting loop for the web, plus a poster frame.
    await run(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", inp, "-an", "-vf", `scale=${width}:-2`, "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(OUT, `${name}.mp4`)]);
    await run(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", "1.6", "-i", inp, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "4", join(OUT, `${name}.jpg`)]);
  });
}

async function main() {
  const config = loadConfig({ AYIKO_PROVIDER_MODE: "mock", LOCAL_STORAGE_DIR: "./.ayiko-storage" });
  const paths = { ffmpeg: config.FFMPEG_PATH, ffprobe: config.FFPROBE_PATH };
  const { voices, video } = buildProviders(config, paths);
  const storage = new LocalStorage(config.LOCAL_STORAGE_DIR);
  const ledger = new InMemoryLedger();
  const deps: EngineDeps = { voices, video, storage, ledger, jobs: new InMemoryJobStore(), moderator: new BasicModerator(), paths };
  await ledger.grant("showcase", 10_000, "admin");
  await mkdir(OUT, { recursive: true });

  for (const s of SHOTS) {
    const t = getTemplate(s.template)!;
    const img = await readMedia(join(SRC, `${s.photo}.png`));
    const imageKey = await storage.put(keys.upload("showcase", `${s.slug}.png`), img);
    const r = await runCaptionedShort(
      { userId: "showcase", imageKey, script: s.script, language: s.language, gender: s.gender, motionPrompt: t.motionPrompt, headline: t.headline, brandName: s.brand, cta: s.cta, watermark: true },
      deps,
    );
    await webVersion(paths.ffmpeg, r.outputKey, storage, s.slug, 540);
    console.log(`✓ ${s.slug} (${s.language}) ${r.durationS}s`);
  }

  const img = await readMedia(join(SRC, "0.png"));
  const imageKey = await storage.put(keys.upload("showcase", "multi.png"), img);
  const t = getTemplate("product-promo")!;
  const items = await runLanguageMultiplier(
    { userId: "showcase", imageKey, gender: "female", motionPrompt: t.motionPrompt, watermark: false },
    MULTI,
    deps,
  );
  for (const it of items) {
    if (!it.ok) throw new Error(`${it.language}: ${it.error}`);
    await webVersion(paths.ffmpeg, it.outputKey, storage, `multi-${it.language}`, 360);
    console.log(`✓ multi-${it.language}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
