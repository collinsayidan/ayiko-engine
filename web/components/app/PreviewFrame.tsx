"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULTS, phrases, type Design } from "@/lib/design";

/**
 * A read-only 9:16 preview of what the renderer will make: photo, headline tag,
 * word-by-word captions and the end card, drawn at the renderer's own
 * proportions (1080×1920 units). Used on the create screen so people see the
 * look before they spend credits.
 */
export function PreviewFrame({ photo, headline, script, brand, cta, design, captionStyle, watermark, endCard }: {
  photo: string | null;
  headline: string;
  script: string;
  brand: string;
  cta: string;
  design: Design;
  captionStyle: "pop" | "box";
  watermark: boolean;
  endCard: boolean;
}) {
  const d = { ...DEFAULTS, ...design };
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setTick((n) => n + 1), 420);
    return () => clearInterval(t);
  }, []);

  const k = w / 1080;
  const h = (w * 16) / 9;
  const lines = useMemo(() => phrases(script), [script]);
  const line = lines[Math.floor(tick / 4) % lines.length] ?? "";
  const words = line.split(" ");
  const hot = tick % 4 % Math.max(1, words.length);
  const tf = (s: string) => (d.uppercase ? s.toLocaleUpperCase() : s);

  return (
    <div className="frame preview-frame" ref={ref} style={{ height: h }}>
      {photo
        ? <img className={`frame-media kenburns${endCard ? " blurred" : ""}`} src={photo} alt="" />
        : <div className="frame-empty"><span>Your photo appears here</span></div>}

      {!endCard && headline.trim() && (
        <span className="layer headline-layer static" style={{ top: d.headlineY * h, fontSize: 64 * k, padding: `${20 * k}px ${26 * k}px`, background: d.accent, letterSpacing: 3 * k }}>
          {headline.trim().toUpperCase()}
        </span>
      )}

      {!endCard && (
        <span
          className={`layer caption-layer static ${captionStyle}`}
          style={{ bottom: h - d.captionY * h, fontSize: (captionStyle === "pop" ? 84 : 74) * d.captionScale * k, maxWidth: (1080 - 2 * (captionStyle === "pop" ? 80 : 90)) * k, WebkitTextStroke: captionStyle === "pop" ? `${Math.max(1, 7 * k)}px #0B0B14` : undefined }}
        >
          {captionStyle === "pop"
            ? words.map((wd, i) => (
                <span key={i}>
                  {i > 0 && " "}
                  <span style={i === hot ? { color: d.highlight, display: "inline-block", transform: "scale(1.12)" } : undefined}>{tf(wd)}</span>
                </span>
              ))
            : <span className="boxed" style={{ padding: `${4 * k}px ${18 * k}px` }}>{tf(line)}</span>}
        </span>
      )}

      {endCard && (
        <div className="endcard">
          {brand.trim() && <b style={{ fontSize: 100 * k }}>{brand.trim()}</b>}
          {cta.trim() && <span style={{ background: d.accent, fontSize: 48 * k, padding: `${26 * k}px ${60 * k}px` }}>{cta.trim()}</span>}
          {!brand.trim() && !cta.trim() && <p>Add a brand name or call to action to show an end card.</p>}
        </div>
      )}

      {watermark && <span className="wm" style={{ fontSize: 32 * k, top: 60 * k, right: 40 * k }}>ayiko.ai</span>}
    </div>
  );
}
