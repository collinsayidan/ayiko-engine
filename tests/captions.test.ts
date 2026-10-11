import { describe, expect, it } from "vitest";
import { assEscape, assTime, buildAss, roundedRect, splitPhrases, timeCues, wordTimings } from "../src/captions";

describe("splitPhrases", () => {
  it("breaks at sentence ends and keeps phrases short", () => {
    const p = splitPhrases("Akwaaba! Ntoma foforo aba. Bra bɛhwɛ yɛn ntoma fɛfɛ no nnɛ.", 28);
    expect(p).toEqual(["Akwaaba!", "Ntoma foforo aba.", "Bra bɛhwɛ yɛn ntoma fɛfɛ no", "nnɛ."]);
    for (const x of p) expect([...x].length).toBeLessThanOrEqual(28);
  });

  it("keeps Yoruba tone marks intact", () => {
    const p = splitPhrases("Ẹ káàbọ̀! Aṣọ tuntun ti dé.");
    expect(p.join(" ")).toBe("Ẹ káàbọ̀! Aṣọ tuntun ti dé.");
  });

  it("returns nothing for an empty script", () => {
    expect(splitPhrases("   ")).toEqual([]);
  });
});

describe("timeCues", () => {
  it("fills the audio in order without overlaps", () => {
    const cues = timeCues(["Akwaaba!", "Ntoma foforo aba.", "Bra bɛhwɛ yɛn ntoma"], 6);
    expect(cues[0]!.start).toBeCloseTo(0.1);
    expect(cues.at(-1)!.end).toBeCloseTo(5.8, 1);
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.start).toBeCloseTo(cues[i - 1]!.end, 2);
  });

  it("gives longer phrases more time", () => {
    const [a, b] = timeCues(["Hi.", "This phrase is much longer"], 5);
    expect(b!.end - b!.start).toBeGreaterThan(a!.end - a!.start);
  });
});

describe("ASS output", () => {
  it("formats timestamps", () => {
    expect(assTime(0)).toBe("0:00:00.00");
    expect(assTime(65.237)).toBe("0:01:05.24");
  });

  it("neutralises override characters", () => {
    expect(assEscape("a{\\b}c")).toBe("a(/b)c");
  });

  it("lights up each word in turn (pop style)", () => {
    const ass = buildAss([{ start: 0.1, end: 1.1, text: "Akwaaba o!" }], { durationS: 2 });
    const events = ass.split("\n").filter((l) => l.startsWith("Dialogue: 0,"));
    expect(events).toHaveLength(2);
    expect(events[0]).toContain("{\\c&H00E8D345&\\fscx112\\fscy112}Akwaaba{\\r} o!");
    expect(events[1]).toContain("Akwaaba {\\c&H00E8D345&\\fscx112\\fscy112}o!{\\r}");
  });

  it("supports the classic white box style", () => {
    const ass = buildAss([{ start: 0.1, end: 1, text: "Akwaaba!" }], { durationS: 2, style: "box" });
    expect(ass).toContain("Dialogue: 0,0:00:00.10,0:00:01.00,Box");
  });

  it("adds a headline, an end card and the watermark", () => {
    const ass = buildAss([{ start: 0.1, end: 1, text: "Akwaaba!" }], {
      durationS: 4, voiceEndS: 2, headline: "New in", brand: "AMA Glow Serum", cta: "Order on WhatsApp", watermark: "ayiko.ai",
    });
    expect(ass).toContain("NEW IN");
    expect(ass).toMatch(/Dialogue: 4,0:00:02\.00,0:00:04\.00,Brand.*AMA Glow Serum/);
    expect(ass).toContain("Order on WhatsApp");
    expect(ass).toContain("\\p1");
    expect(ass).toContain("Made with ayiko.ai");
  });
});

describe("helpers", () => {
  it("splits a cue's time across words by length", () => {
    const w = wordTimings({ start: 0, end: 3, text: "a bb" });
    expect(w[0]!.end).toBeCloseTo(1);
    expect(w[1]!.end).toBeCloseTo(3);
  });

  it("draws a closed rounded rectangle", () => {
    expect(roundedRect(200, 100, 50).startsWith("m 50 0")).toBe(true);
  });
});
