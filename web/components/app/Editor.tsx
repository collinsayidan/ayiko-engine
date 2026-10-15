"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoMark } from "../Icons";
import { languageByCode, LIMITS } from "@/lib/catalog";
import { ACCENTS, DEFAULTS, HIGHLIGHTS, cleanDesign, phrases, type Design } from "@/lib/design";
import { Icon } from "./icons";

interface Job {
  id: string;
  language: string;
  title: string;
  canEdit: boolean;
  script: string;
  headline: string;
  brandName: string;
  cta: string;
  captionStyle: "pop" | "box";
  design: Record<string, unknown>;
}

type Layer = "caption" | "headline";

/** Everything undo and redo track. */
interface Doc { design: Required<Design>; style: "pop" | "box"; headline: string; brand: string; cta: string; script: string }

/**
 * The editing canvas. A live 9:16 preview of the video with its design
 * layers drawn on top at the renderer's own proportions (1080×1920 units),
 * so what you place here is where it lands in the final video. Drag the
 * captions or the headline, pick colours and style, then render a new
 * version that reuses the original voice and AI clip (1 credit).
 * Undo and redo cover every change (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z).
 */
export function Editor({ job, media, balance, watermark, brandColours = [] }: {
  job: Job;
  media: { clipUrl: string | null; photoUrl: string | null; outputUrl: string | null };
  balance: number;
  watermark: boolean;
  /** Colours saved in the brand kit, offered first. */
  brandColours?: string[];
}) {
  const start = cleanDesign(job.design);
  const [doc, setDocState] = useState<Doc>({ design: { ...DEFAULTS, ...start }, style: job.captionStyle, headline: job.headline, brand: job.brandName, cta: job.cta, script: job.script });
  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const lastPush = useRef(0);
  const [, setHistoryTick] = useState(0);
  // Rapid changes (typing, dragging) fold into one undo step.
  const setDoc = useCallback((patch: Partial<Doc> | ((d: Doc) => Partial<Doc>)) => {
    setDocState((cur) => {
      const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
      const now = Date.now();
      if (now - lastPush.current > 600) past.current = [...past.current.slice(-49), cur];
      lastPush.current = now;
      future.current = [];
      return next;
    });
    setHistoryTick((n) => n + 1);
  }, []);
  const undo = useCallback(() => {
    setDocState((cur) => { const prev = past.current.pop(); if (!prev) return cur; future.current.push(cur); return prev; });
    lastPush.current = 0;
    setHistoryTick((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    setDocState((cur) => { const nxt = future.current.pop(); if (!nxt) return cur; past.current.push(cur); return nxt; });
    lastPush.current = 0;
    setHistoryTick((n) => n + 1);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || (e.target as HTMLElement)?.matches?.("input, textarea")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);
  const { design, style, headline, brand, cta, script } = doc;
  const setStyle = (v: Doc["style"]) => setDoc({ style: v });
  const setHeadline = (v: string) => setDoc({ headline: v });
  const setBrand = (v: string) => setDoc({ brand: v });
  const setCta = (v: string) => setDoc({ cta: v });
  const setScript = (v: string) => setDoc({ script: v });
  const [endCard, setEndCard] = useState(false);
  const [view, setView] = useState<"edit" | "original">("edit");
  const [drag, setDrag] = useState<Layer | null>(null);
  const [selected, setSelected] = useState<Layer>("caption");
  const [tick, setTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const frameRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);

  // Scale: the renderer works in 1080-wide units.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const k = w / 1080;
  const h = (w * 16) / 9;

  // Cycle through the caption phrases and highlight words like the real video.
  const lines = useMemo(() => phrases(script), [script]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setTick((n) => n + 1), 420);
    return () => clearInterval(t);
  }, []);
  const line = lines[Math.floor(tick / 4) % lines.length] ?? "";
  const lineWords = line.split(" ");
  const hot = tick % 4 % Math.max(1, lineWords.length);
  const tf = (s: string) => (design.uppercase ? s.toLocaleUpperCase() : s);

  const set = (patch: Partial<Design>) => setDoc((d) => ({ design: { ...d.design, ...patch } }));
  const accents = [...new Set([...brandColours.map((c) => c.toUpperCase()), ...ACCENTS])];

  // Dragging layers vertically (pointer events: mouse, touch and pen).
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect) return;
      let y = (e.clientY - rect.top) / rect.height;
      if (drag === "caption") {
        if (Math.abs(y - 0.5) < 0.015) y = 0.5; // snap to centre
        set({ captionY: Math.min(0.95, Math.max(0.15, y)) });
      } else {
        set({ headlineY: Math.min(0.8, Math.max(0.03, y)) });
      }
    };
    const up = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag]);

  function nudge(layer: Layer, e: React.KeyboardEvent) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const dir = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    if (layer === "caption") set({ captionY: Math.min(0.95, Math.max(0.15, design.captionY + dir * step)) });
    else set({ headlineY: Math.min(0.8, Math.max(0.03, design.headlineY + dir * step)) });
  }

  async function render() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/rerender", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: job.id, design: cleanDesign(design), captionStyle: style, headline, brandName: brand, cta, script }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "We couldn't start the new version."); setSaving(false); return; }
      window.location.href = "/app/videos?edited=1";
    } catch {
      setError("Check your connection and try again.");
      setSaving(false);
    }
  }

  const captionBottom = design.captionY * h;
  const headlineTop = design.headlineY * h;
  const lang = languageByCode(job.language)?.name ?? job.language;
  const outline = `${Math.max(1, 7 * k)}px`;

  return (
    <div className="studio editor">
      <header className="topbar">
        <div className="topbar-left">
          <a className="back" href="/app/videos" aria-label="Back to My videos"><Icon name="arrowLeft" /></a>
          <a className="logo" href="/app/videos" aria-label="Ayiko studio"><LogoMark /><span>ayiko<em>.ai</em></span></a>
        </div>
        <div className="topbar-right">
          <div className="undo-group" role="group" aria-label="History">
            <button type="button" onClick={undo} disabled={!past.current.length} aria-label="Undo" title="Undo (Ctrl+Z)"><Icon name="undo" /></button>
            <button type="button" onClick={redo} disabled={!future.current.length} aria-label="Redo" title="Redo (Shift+Ctrl+Z)"><Icon name="redo" /></button>
          </div>
          <span className="credits"><b>{balance}</b> credits</span>
        </div>
      </header>

      <div className="editor-grid">
        <section className="stage" aria-label="Preview">
          <div className="stage-tabs" role="tablist">
            <button role="tab" aria-selected={view === "edit"} className={view === "edit" ? "on" : ""} onClick={() => setView("edit")}>Edit</button>
            <button role="tab" aria-selected={view === "original"} className={view === "original" ? "on" : ""} onClick={() => setView("original")} disabled={!media.outputUrl}>Current video</button>
          </div>

          <div className="frame" ref={frameRef} style={{ height: h }}>
            {view === "original" && media.outputUrl ? (
              <video className="frame-media" src={media.outputUrl} controls autoPlay playsInline />
            ) : (
              <>
                {media.clipUrl
                  ? <video className={`frame-media${endCard ? " blurred" : ""}`} src={media.clipUrl} poster={media.photoUrl ?? undefined} autoPlay muted loop playsInline />
                  : media.photoUrl && <img className={`frame-media${endCard ? " blurred" : ""}`} src={media.photoUrl} alt="" />}

                {!endCard && headline.trim() && (
                  <button
                    type="button"
                    className={`layer headline-layer${selected === "headline" ? " sel" : ""}`}
                    style={{ top: headlineTop, fontSize: 64 * k, padding: `${20 * k}px ${26 * k}px`, background: design.accent, letterSpacing: 3 * k }}
                    onPointerDown={(e) => { e.preventDefault(); setSelected("headline"); setDrag("headline"); }}
                    onFocus={() => setSelected("headline")}
                    onKeyDown={(e) => nudge("headline", e)}
                    aria-label="Headline. Drag, or use the up and down arrow keys, to move it."
                  >
                    {headline.trim().toUpperCase()}
                  </button>
                )}

                {!endCard && (
                  <button
                    type="button"
                    className={`layer caption-layer ${style}${selected === "caption" ? " sel" : ""}`}
                    style={{ bottom: h - captionBottom, fontSize: (style === "pop" ? 84 : 74) * design.captionScale * k, maxWidth: (1080 - 2 * (style === "pop" ? 80 : 90)) * k, WebkitTextStroke: style === "pop" ? `${outline} #0B0B14` : undefined }}
                    onPointerDown={(e) => { e.preventDefault(); setSelected("caption"); setDrag("caption"); }}
                    onFocus={() => setSelected("caption")}
                    onKeyDown={(e) => nudge("caption", e)}
                    aria-label="Captions. Drag, or use the up and down arrow keys, to move them."
                  >
                    {style === "pop"
                      ? lineWords.map((wd, i) => (
                          <span key={i}>
                            {i > 0 && " "}
                            <span style={i === hot ? { color: design.highlight, display: "inline-block", transform: "scale(1.12)" } : undefined}>{tf(wd)}</span>
                          </span>
                        ))
                      : <span className="boxed" style={{ padding: `${4 * k}px ${18 * k}px` }}>{tf(line)}</span>}
                  </button>
                )}

                {endCard && (
                  <div className="endcard">
                    {brand.trim() && <b style={{ fontSize: 100 * k }}>{brand.trim()}</b>}
                    {cta.trim() && <span style={{ background: design.accent, fontSize: 48 * k, padding: `${26 * k}px ${60 * k}px` }}>{cta.trim()}</span>}
                    {!brand.trim() && !cta.trim() && <p>Add a brand name or call to action to show an end card.</p>}
                  </div>
                )}

                {watermark && <span className="wm" style={{ fontSize: 32 * k, top: 60 * k, right: 40 * k }}>ayiko.ai</span>}
                {drag === "caption" && Math.abs(design.captionY - 0.5) < 0.001 && <i className="guide" style={{ top: h / 2 }} />}
              </>
            )}
          </div>

          {view === "edit" && (
            <div className="stage-tools">
              <label className="menu-switch"><input type="checkbox" checked={endCard} onChange={(e) => setEndCard(e.target.checked)} /><span>Preview end card</span></label>
              <span className="muted small">{lang} · drag the captions or headline to move them</span>
            </div>
          )}
        </section>

        <aside className="inspector" aria-label="Design">
          <h1>Edit “{job.title}”</h1>
          {!job.canEdit && <p className="banner">This video was made before editing was possible. Make a new video to use the canvas.</p>}

          <fieldset>
            <legend>Captions</legend>
            <div className="seg" role="radiogroup" aria-label="Caption style">
              <button type="button" role="radio" aria-checked={style === "pop"} className={style === "pop" ? "on" : ""} onClick={() => setStyle("pop")}>Word pop</button>
              <button type="button" role="radio" aria-checked={style === "box"} className={style === "box" ? "on" : ""} onClick={() => setStyle("box")}>White box</button>
            </div>
            <div className="seg" role="group" aria-label="Caption position">
              {([["Top", 0.3], ["Middle", 0.6], ["Bottom", DEFAULTS.captionY]] as const).map(([label, y]) => (
                <button key={label} type="button" className={Math.abs(design.captionY - y) < 0.01 ? "on" : ""} onClick={() => set({ captionY: y })}>{label}</button>
              ))}
            </div>
            <label className="range">
              <span>Size <b>{Math.round(design.captionScale * 100)}%</b></span>
              <input type="range" min={70} max={140} step={5} value={Math.round(design.captionScale * 100)} onChange={(e) => set({ captionScale: Number(e.target.value) / 100 })} />
            </label>
            <label className="menu-switch"><input type="checkbox" checked={design.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} /><span>Capital letters</span></label>
            {style === "pop" && (
              <div className="swatches" role="radiogroup" aria-label="Spoken word colour">
                <span>Spoken word</span>
                {HIGHLIGHTS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={design.highlight === c} aria-label={c} className={design.highlight === c ? "on" : ""} style={{ background: c }} onClick={() => set({ highlight: c })} />
                ))}
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend>Brand colour</legend>
            <div className="swatches" role="radiogroup" aria-label="Headline and button colour">
              <span>Headline and button</span>
              {accents.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={design.accent === c} aria-label={c} className={design.accent === c ? "on" : ""} style={{ background: c }} onClick={() => set({ accent: c })} />
              ))}
              <label className={`swatch-custom${accents.includes(design.accent.toUpperCase()) ? "" : " on"}`} title="Pick any colour" style={accents.includes(design.accent.toUpperCase()) ? undefined : { background: design.accent }}>
                <span className="sr-only">Custom brand colour</span>
                <input type="color" value={design.accent} onChange={(e) => set({ accent: e.target.value.toUpperCase() })} />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Text</legend>
            <div className="field"><label htmlFor="e-head">Headline tag</label><input id="e-head" maxLength={LIMITS.headline} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="New in" /></div>
            <div className="field"><label htmlFor="e-brand">Brand or product name</label><input id="e-brand" maxLength={LIMITS.brand} value={brand} onChange={(e) => setBrand(e.target.value)} onFocus={() => setEndCard(true)} /></div>
            <div className="field"><label htmlFor="e-cta">Call to action</label><input id="e-cta" maxLength={LIMITS.cta} value={cta} onChange={(e) => setCta(e.target.value)} onFocus={() => setEndCard(true)} /></div>
            <div className="field">
              <label htmlFor="e-script">Caption words</label>
              <textarea id="e-script" rows={3} lang={job.language === "twi" ? "tw" : job.language} value={script} onChange={(e) => setScript(e.target.value)} onFocus={() => setEndCard(false)} />
              <small className="muted">Fix spelling here. The voice stays the same, so keep the words matching what is said.</small>
            </div>
          </fieldset>

          <button type="button" className="linkish" onClick={() => setDoc({ design: { ...DEFAULTS }, style: "pop" })}>Reset to Ayiko style</button>

          <div className="go">
            <div className="quote"><span>Same voice and AI clip, new look</span><b>1 credit</b></div>
            <button type="button" className="btn wide" disabled={saving || !job.canEdit || balance < 1} onClick={() => void render()}>
              {saving ? "Starting…" : balance < 1 ? "You need 1 credit" : "Render new version"}
            </button>
            <p className="err" role="alert">{error}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
