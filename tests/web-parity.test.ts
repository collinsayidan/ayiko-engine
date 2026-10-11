import { describe, expect, it } from "vitest";
import { quoteMultiplier, quoteShort } from "../src/credits";
import { TEMPLATES } from "../src/templates";
import { LANGUAGES } from "../src/languages";
import { quoteGeneration } from "../web/lib/pricing";
import { APP_LANGUAGES, APP_TEMPLATES } from "../web/lib/catalog";

/** The website charges up front; the engine's prices are the source of truth. They must agree. */
describe("website and engine agree", () => {
  const scripts = ["Akwaaba!", "Ẹ káàbọ̀! Ọ̀jà tuntun ti dé.", Array(120).fill("word").join(" ")];

  it("on prices", () => {
    for (const d of [5, 10] as const) {
      for (const s of scripts) expect(quoteGeneration([s], d).total).toBe(quoteShort({ script: s, videoDurationS: d }).total);
      expect(quoteGeneration(scripts, d).total).toBe(quoteMultiplier(scripts, d).total);
    }
  });

  it("on templates and motion prompts", () => {
    for (const t of APP_TEMPLATES) {
      const e = TEMPLATES.find((x) => x.id === t.id);
      expect(e, t.id).toBeDefined();
      expect(e!.status).toBe("ready");
      expect(t.motionPrompt).toBe(e!.motionPrompt);
      expect(t.headline).toBe(e!.headline);
      expect(t.videoDurationS).toBe(e!.videoDurationS);
    }
  });

  it("on language codes", () => {
    for (const l of APP_LANGUAGES) expect(Object.keys(LANGUAGES)).toContain(l.code);
  });
});
