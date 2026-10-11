import { describe, expect, it } from "vitest";
import { assEscape, assTime, buildAss, splitPhrases, timeCues } from "../src/captions";

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

  it("includes captions and the watermark", () => {
    const ass = buildAss([{ start: 0.1, end: 1, text: "Akwaaba!" }], { durationS: 2, watermark: "ayiko.ai" });
    expect(ass).toContain("Dialogue: 0,0:00:00.10,0:00:01.00,Caption");
    expect(ass).toContain("Akwaaba!");
    expect(ass).toContain(",Mark,,0,0,0,,ayiko.ai");
  });
});
