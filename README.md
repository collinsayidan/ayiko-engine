# Ayiko engine

The generation engine behind Ayiko.ai. You give it a photo, a script and a language, and it returns a captioned 9:16 video with a voiceover in that language.

```
upload ─► start (moderate, quote, charge credits)
             ├─► voice  (routed by language, with fallback) ─┐
             └─► video  (image-to-video on fal.ai)           ─┤
                                                              ▼
                                 render (captions + FFmpeg) ─► finish
                         any failure after charging ─► full refund
```

## Quick start (no API keys needed)

Requires Node 20+ and FFmpeg (`brew install ffmpeg` on Mac, `sudo apt install ffmpeg` on Ubuntu).

```bash
npm install
npm run demo          # Language Multiplier: one clip in Twi, English, Yoruba and Pidgin
npm test              # 29 tests
npm run typecheck
```

Mock mode stands in for the AI providers locally: the "voice" is a soft tone timed to the script and the "video" is a slow zoom on the image. Everything else is real: routing, credits, refunds, captions, rendering and the job log. The output lands in `./out/`.

Options:

```bash
npm run demo -- --langs yo,pcm --template new-arrival --gender male --image ./photo.jpg
npm run demo -- --langs twi --script "Akwaaba! Nneɛma foforo aba."
```

## Going live

1. Copy `.env.example` to `.env` and set `AYIKO_PROVIDER_MODE=live`.
2. Add `FAL_KEY` (required) and whichever voice keys you have: `ELEVENLABS_API_KEY`, `KHAYA_API_KEY`, `NAIJALINGO_API_KEY`. Languages whose providers have no key are switched off automatically.
3. Run `npm run demo -- --live --lang twi`.

**Check before relying on it:** the Khaya and 9jaLingo adapters follow their official SDK docs, but neither publishes a full REST reference. The exact JSON field names in `buildBody()` (in `src/providers/khaya.ts` and `src/providers/naijalingo.ts`) need confirming on the first live call. Base URLs and paths are set in `.env`.

## Where things live

| File | What it does |
| --- | --- |
| `src/languages.ts` | Language catalogue and voice routing order. **Edit this after the native-speaker blind test.** |
| `src/router.ts` | Tries voice providers in order, falls back on failure, logs every attempt |
| `src/providers/` | One adapter per provider: fal.ai, ElevenLabs, Khaya, 9jaLingo, plus mocks |
| `src/captions.ts` | Captions built from the script and timed to the audio, so they work in any language |
| `src/render.ts` | FFmpeg: colour grade, vignette and grain, loops the clip under the voice, blurred end card, fades; exports 9:16, 1:1 or 16:9 MP4 |
| `assets/fonts/` | Bundled Inter (SIL Open Font Licence), which covers Twi and Yoruba characters, so captions look the same on every machine |
| `scripts/make-sample.py` | Renders the demo product shot in `samples/` |
| `src/templates.ts` | Templates: curated motion prompts, length, format and script starters |
| `src/credits.ts` | Prices, quotes and the credit ledger rules |
| `src/pipeline.ts` | The captioned-short pipeline, split into steps that can be retried |
| `src/inngest.ts` | Runs the pipeline as background jobs in production (retries, per-user limits) |
| `src/supabase.ts` | Postgres-backed ledger and job store |
| `supabase/migrations/0001_init.sql` | Tables, row-level security, atomic credit functions, signup bonus, launch presets |

## Design decisions

- **Every video gets the Ayiko look:** a headline tag, word-by-word captions where the spoken word lights up, and an end card with the brand name and a call-to-action pill. Pass `headline`, `brandName` and `cta` on the request, or `captionStyle: "box"` for the classic white-box captions.
- **Captions come from the script, not speech-to-text.** Speech recognition is weak for Twi, Yoruba and Pidgin, but we already know exactly what was said.
- **Language Multiplier.** `runLanguageMultiplier` makes the AI clip once and adds each language for voice + render only: four languages cost 22 credits instead of 52. Each language is its own job, so one failing voice refunds only that language.
- **Regenerating is cheap.** Pass `reuse.videoKey` to keep the clip and change only the language or voice: that costs 3 credits instead of 13, and saves the most expensive provider call.
- **Credits are charged before any paid call and refunded automatically on failure.** In Postgres, `spend_credits` locks per user so two jobs can't overdraw, and unique indexes make refunds and Stripe top-ups safe to retry.
- **Each step reads and writes storage keys**, so the same code runs in one process or as separate retryable queue steps.
- **Every provider call is logged** in `generations` with latency, outcome and cost, ready for a margin dashboard by language and provider.

## Next to build

1. Next.js app: upload, editor, gallery, credits page (calls `inngest.send("ayiko/short.requested", …)`)
2. Stripe checkout and webhook → `grant_credits`
3. A proper moderation API in `src/moderation.ts` (text and images)
4. Script drafting and English → Twi/Yoruba translation step
