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

export type CaptionStyle = "pop" | "box";

export interface AssOptions {
  width?: number;
  height?: number;
  /** Total video length (voiceover plus end card) */
  durationS: number;
  /** When the voiceover ends and the end card begins. Defaults to durationS. */
  voiceEndS?: number;
  /** "pop": bold white words, the spoken word lights up (default). "box": dark text on a white box. */
  style?: CaptionStyle;
  /** Short title shown at the top for the first two seconds, e.g. "NEW IN" */
  headline?: string;
  /** End card: brand name and call to action, e.g. "Order on WhatsApp" */
  brand?: string;
  cta?: string;
  watermark?: string;
}

// Colours are &HAABBGGRR
const WHITE = "&H00FFFFFF";
const INK = "&H002A1316"; // #16132A
const OUTLINE = "&H00140B0B"; // #0B0B14
const SHADOW = "&H96000000";
const SIGNAL = "&H00E8D345"; // #45D3E8 cyan: the spoken word
const ACCENT = "&H00FF6854"; // #5468FF cobalt: headline tag and CTA pill

/** Split a cue's time across its words, in proportion to their length. */
export function wordTimings(cue: Cue): { word: string; start: number; end: number }[] {
  const words = cue.text.split(" ").filter(Boolean);
  const weights = words.map((w) => Math.max(1, [...w].length));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = cue.start;
  return words.map((word, i) => {
    const len = ((cue.end - cue.start) * weights[i]!) / total;
    const out = { word, start: t, end: t + len };
    t += len;
    return out;
  });
}

/** An ASS vector path for a rounded rectangle of width w, height h, corner radius r. */
export function roundedRect(w: number, h: number, r: number): string {
  const R = Math.min(r, h / 2, w / 2);
  const n = (x: number) => Math.round(x);
  return [
    `m ${n(R)} 0`, `l ${n(w - R)} 0`, `b ${n(w)} 0 ${n(w)} 0 ${n(w)} ${n(R)}`,
    `l ${n(w)} ${n(h - R)}`, `b ${n(w)} ${n(h)} ${n(w)} ${n(h)} ${n(w - R)} ${n(h)}`,
    `l ${n(R)} ${n(h)}`, `b 0 ${n(h)} 0 ${n(h)} 0 ${n(h - R)}`,
    `l 0 ${n(R)}`, `b 0 0 0 0 ${n(R)} 0`,
  ].join(" ");
}

/**
 * Builds the subtitle file that carries Ayiko's on-screen design:
 * headline tag, word-by-word captions, end card and watermark.
 * Fonts are the bundled Inter weights (assets/fonts), so every machine
 * renders the same and Twi/Yoruba characters always display.
 */
export function buildAss(cues: Cue[], opts: AssOptions): string {
  const w = opts.width ?? 1080;
  const h = opts.height ?? 1920;
  const k = w / 1080; // scale everything for 1:1 and 16:9
  const px = (n: number) => Math.round(n * k);
  const voiceEnd = Math.min(opts.voiceEndS ?? opts.durationS, opts.durationS);
  const style = opts.style ?? "pop";
  const capV = h >= w ? px(330) : px(110);
  const cx = Math.round(w / 2);

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
    `Style: Pop,Inter Black,${px(84)},${WHITE},${WHITE},${OUTLINE},${SHADOW},0,0,0,0,100,100,0,0,1,${px(7)},${px(4)},2,${px(80)},${px(80)},${capV},1`,
    `Style: Box,Inter ExtraBold,${px(74)},${INK},${INK},${WHITE},&H00000000,0,0,0,0,100,100,0,0,3,${px(18)},0,2,${px(90)},${px(90)},${capV},1`,
    `Style: Title,Inter Black,${px(64)},${WHITE},${WHITE},${ACCENT},&H00000000,0,0,0,0,100,100,${px(3)},0,3,${px(20)},0,8,${px(60)},${px(60)},0,1`,
    `Style: Brand,Inter Black,${px(100)},${WHITE},${WHITE},${OUTLINE},${SHADOW},0,0,0,0,100,100,0,0,1,0,${px(5)},5,${px(60)},${px(60)},0,1`,
    `Style: Cta,Inter ExtraBold,${px(48)},${WHITE},${WHITE},${OUTLINE},&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`,
    `Style: Mark,Inter SemiBold,${px(32)},&H33FFFFFF,&H33FFFFFF,&H80000000,&H80000000,0,0,0,0,100,100,1,0,1,${px(2)},0,9,${px(40)},${px(40)},${px(60)},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const ev = (layer: number, start: number, end: number, st: string, text: string) =>
    lines.push(`Dialogue: ${layer},${assTime(start)},${assTime(end)},${st},,0,0,0,,${text}`);

  // Captions
  for (const cue of cues) {
    if (style === "box") {
      ev(0, cue.start, cue.end, "Box", `{\\fad(80,60)}${assEscape(cue.text)}`);
      continue;
    }
    const words = wordTimings(cue);
    words.forEach((wd, i) => {
      const text = words
        .map((o, j) => (j === i ? `{\\c${SIGNAL}&\\fscx112\\fscy112}${assEscape(o.word)}{\\r}` : assEscape(o.word)))
        .join(" ");
      ev(0, wd.start, wd.end, "Pop", (i === 0 ? "{\\fad(90,0)}" : "") + text);
    });
  }

  // Headline tag slides in at the top
  if (opts.headline?.trim()) {
    const end = Math.min(2.6, voiceEnd);
    ev(2, 0.15, end, "Title", `{\\an8\\move(${cx},${px(150)},${cx},${px(200)},0,300)\\fad(200,250)}${assEscape(opts.headline.trim().toUpperCase())}`);
  }

  // End card: brand name and a call-to-action pill
  if (voiceEnd < opts.durationS && (opts.brand?.trim() || opts.cta?.trim())) {
    const mid = h / 2;
    if (opts.brand?.trim()) {
      ev(4, voiceEnd, opts.durationS, "Brand", `{\\an5\\pos(${cx},${Math.round(mid - px(70))})\\fad(250,0)\\fscx86\\fscy86\\t(0,260,\\fscx100\\fscy100)}${assEscape(opts.brand.trim())}`);
    }
    if (opts.cta?.trim()) {
      const cta = assEscape(opts.cta.trim());
      const pw = px([...cta].length * 29 + 120);
      const ph = px(104);
      const y = Math.round(mid + px(90));
      ev(3, voiceEnd + 0.15, opts.durationS, "Cta", `{\\an5\\pos(${cx},${y})\\p1\\bord0\\shad0\\1c${ACCENT}&\\fad(250,0)}${roundedRect(pw, ph, ph / 2)}{\\p0}`);
      ev(4, voiceEnd + 0.15, opts.durationS, "Cta", `{\\an5\\pos(${cx},${y})\\fad(250,0)}${cta}`);
    }
  }

  if (opts.watermark) {
    ev(1, 0, voiceEnd, "Mark", assEscape(opts.watermark));
    if (voiceEnd < opts.durationS) {
      ev(1, voiceEnd, opts.durationS, "Mark", `{\\an2\\pos(${cx},${h - px(110)})\\fad(250,0)}Made with ${assEscape(opts.watermark)}`);
    }
  }
  return lines.join("\n") + "\n";
}
