/**
 * Captions from the script itself, timed to the voiceover.
 *
 * Speech-to-text is weak for Twi, Yoruba and Pidgin, but we already know
 * exactly what was said: the script. So we split it into short phrases and
 * spread them across the audio in proportion to their length. This works
 * the same in every language and costs nothing.
 */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** Split a script into caption phrases of at most `maxChars`, breaking at sentence ends first. */
export function splitPhrases(script: string, maxChars = 28): string[] {
  const clean = script.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+[.!?…]*["”’)]*\s*/gu) ?? [clean];
  const phrases: string[] = [];
  for (const sentence of sentences) {
    const words = sentence.trim().split(" ").filter(Boolean);
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if ([...next].length > maxChars && cur) {
        phrases.push(cur);
        cur = w;
      } else {
        cur = next;
      }
    }
    if (cur) phrases.push(cur);
  }
  return phrases;
}

/** Weight a phrase by visible characters, plus a pause after sentence-ending punctuation. */
function weight(phrase: string): number {
  const chars = [...phrase.replace(/\s/g, "")].length;
  const pause = /[.!?…]["”’)]*$/u.test(phrase) ? 4 : /[,;:]$/.test(phrase) ? 2 : 0;
  return Math.max(1, chars + pause);
}

export function timeCues(
  phrases: string[],
  durationS: number,
  opts: { leadS?: number; tailS?: number; minCueS?: number } = {},
): Cue[] {
  if (!phrases.length || durationS <= 0) return [];
  const lead = opts.leadS ?? 0.1;
  const tail = opts.tailS ?? 0.2;
  const minCue = opts.minCueS ?? 0.6;
  const usable = Math.max(durationS - lead - tail, phrases.length * minCue);
  const weights = phrases.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  const cues: Cue[] = [];
  let t = lead;
  phrases.forEach((text, i) => {
    const len = (weights[i]! / total) * usable;
    cues.push({ start: round2(t), end: round2(t + len), text });
    t += len;
  });
  return cues;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ASS timestamp: h:mm:ss.cc */
export function assTime(s: number): string {
  const cs = Math.max(0, Math.round(s * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

/** Remove characters that would be read as ASS override codes. */
export function assEscape(text: string): string {
  return text.replace(/\\/g, "/").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, " ");
}

export interface AssOptions {
  width?: number;
  height?: number;
  font?: string;
  /** Total video length, used for the watermark line */
  durationS: number;
  watermark?: string;
}

/**
 * Ayiko caption style: bold dark text on a white box, lower third, a quick
 * fade on each phrase. Matches the landing page look.
 */
export function buildAss(cues: Cue[], opts: AssOptions): string {
  const w = opts.width ?? 1080;
  const h = opts.height ?? 1920;
  const font = opts.font ?? "Inter";
  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Colours are &HAABBGGRR. Text #16132A, box white.
    `Style: Caption,${font},76,&H002A1316,&H002A1316,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,0,0,3,18,0,2,90,90,420,1`,
    `Style: Mark,${font},34,&H00FFFFFF,&H00FFFFFF,&H64000000,&H64000000,-1,0,0,0,100,100,1,0,1,2,0,9,40,40,60,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...cues.map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Caption,,0,0,0,,{\\fad(80,60)}${assEscape(c.text)}`),
  ];
  if (opts.watermark) {
    lines.push(`Dialogue: 1,${assTime(0)},${assTime(opts.durationS)},Mark,,0,0,0,,${assEscape(opts.watermark)}`);
  }
  return lines.join("\n") + "\n";
}
