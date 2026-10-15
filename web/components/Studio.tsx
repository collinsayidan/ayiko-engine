"use client";

import { useEffect, useRef, useState } from "react";
import { TemplateIcon } from "./Icons";
import { LazyVideo } from "./LazyVideo";
import { GREETINGS, LANGS, MULTI_LANGS, QUICK, SHOWCASE, TEMPLATES, estimateCredits, langBy, tplBy } from "@/lib/content";

/**
 * Hero + studio window (composer and live phone preview) + template gallery.
 * They share state, so a template card fills the composer above.
 * `children` render between the language ticker and the templates.
 */
export function Studio({ children }: { children?: React.ReactNode }) {
  const [tplId, setTplId] = useState("product-promo");
  const [lang, setLang] = useState("twi");
  const [voice, setVoice] = useState("female");
  const [idea, setIdea] = useState(tplBy("product-promo").idea);
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<React.ReactNode>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"scroll" | "grid">("scroll");
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  // Enable/disable the rail arrows as it scrolls.
  useEffect(() => {
    const el = railRef.current;
    if (!el || view !== "scroll") return;
    const update = () => {
      setCanPrev(el.scrollLeft > 4);
      setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [view]);

  function scrollTpl(dir: 1 | -1) {
    const el = railRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(".tcard");
    const step = card ? card.offsetWidth + 20 : el.clientWidth * 0.8;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * step * Math.max(1, Math.floor(el.clientWidth / step)), behavior: reduce ? "auto" : "smooth" });
  }

  const l = langBy(lang);
  const t = tplBy(tplId);
  const caption = loading ? "Generating…" : l.caption;

  // Which real showcase video the phone plays (when no photo is uploaded).
  const show = SHOWCASE[tplId];
  const useMulti = tplId === "product-promo" && lang !== "twi" && MULTI_LANGS.includes(lang);
  const videoSrc = useMulti ? `/showcase/multi-${lang}` : `/showcase/${show ? tplId : "product-promo"}`;
  const meaning = loading
    ? `Writing the voiceover in ${l.form}, animating your ${photo ? "photo" : "product"}…`
    : photo
      ? l.meaning || "Original English script"
      : useMulti
        ? `${l.name} · same clip, new voice and captions`
        : show?.meaning ?? "";

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  function applyTemplate(id: string, langCode?: string, scroll = false) {
    const tpl = tplBy(id);
    setTplId(tpl.id);
    if (langCode) setLang(langCode);
    setIdea(tpl.idea);
    setNotice(null);
    if (scroll) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("studio")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      setTimeout(() => textRef.current?.focus({ preventScroll: true }), reduce ? 0 : 500);
    }
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setNotice("That file isn't an image. Try a JPG or PNG.");
      return;
    }
    setPhoto({ url: URL.createObjectURL(f), name: f.name.length > 18 ? f.name.slice(0, 16) + "…" : f.name });
  }

  function generate(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    // Take the chosen template and language into the real studio (login first if needed).
    window.location.href = `/app?template=${encodeURIComponent(tplId)}&lang=${encodeURIComponent(lang)}`;
  }

  return (
    <>
      <section className="hero-x" aria-labelledby="hero-h">
        <div className="hero-copy">
          <a className="kicker" href="#multiplier">
            <span className="kicker-tag">New</span>
            <span>One clip, six languages with the Language Multiplier</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
          <h1 id="hero-h">
            <span className="l1">Make the video.</span>
            <span className="l2">Speak their language.</span>
          </h1>
          <p className="hero-lede">
            Add a photo, say what you want, pick a language. Ayiko returns a ready-to-post video with a natural
            voiceover and captions in <strong>Twi, Yorùbá, Pidgin, Hausa, English</strong> and more.
          </p>
          <div className="hero-cta">
            <a className="btn btn-lg" href="/app">
              Start free
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
            <a className="btn btn-lg ghost" href="#templates">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
              See examples
            </a>
          </div>
          <p className="hero-note">20 free credits, enough for your first video. No card needed.</p>
        </div>

        <div className="window" id="studio">
          <div className="window-bar" aria-hidden="true">
            <span className="dots"><i /><i /><i /></span>
            <span className="window-title">Ayiko Studio</span>
            <span className="window-credits">20 credits</span>
          </div>

          <div className="window-body">
            <form className="composer" onSubmit={generate} noValidate>
              <div className="cfield">
                <label className="clabel" htmlFor="ask-text"><span>1</span>What should the video say?</label>
                <textarea
                  ref={textRef}
                  id="ask-text"
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="A 15-second promo for my shea butter. Say: New stock just landed, order today on WhatsApp."
                />
                <div className="quick" aria-label="Example ideas">
                  {QUICK.map(([label, id, code]) => (
                    <button key={label} type="button" onClick={() => applyTemplate(id, code)}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="cfield">
                <span className="clabel" id="lang-label"><span>2</span>Language</span>
                <div className="langs" role="radiogroup" aria-labelledby="lang-label">
                  {LANGS.map((x) => (
                    <button
                      key={x.code}
                      type="button"
                      role="radio"
                      aria-checked={lang === x.code}
                      className={lang === x.code ? "on" : ""}
                      onClick={() => setLang(x.code)}
                    >
                      {x.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cfield">
                <span className="clabel"><span>3</span>Style</span>
                <div className="crow">
                  <label className={`ctool${photo ? " has-file" : ""}`} htmlFor="ask-photo">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M21 16l-5-5-8 8" /></svg>
                    <span>{photo ? photo.name : "Add photo"}</span>
                    <input id="ask-photo" type="file" accept="image/*" hidden onChange={onPhoto} />
                  </label>
                  <span className="ctool">
                    <select id="ask-template" aria-label="Template" value={tplId} onChange={(e) => applyTemplate(e.target.value)}>
                      {TEMPLATES.filter((x) => x.ready).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </span>
                  <span className="ctool">
                    <select id="ask-voice" aria-label="Voice" value={voice} onChange={(e) => setVoice(e.target.value)}>
                      <option value="female">Female voice</option>
                      <option value="male">Male voice</option>
                    </select>
                  </span>
                </div>
              </div>

              <div className="cfoot">
                <span className="cost"><b>≈ {estimateCredits(idea)}</b> credits</span>
                <button className="btn" type="submit" disabled={loading}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
                  Generate video
                </button>
              </div>
              <p className="notice" aria-live="polite">{notice}</p>
            </form>

            <div className="preview">
              <div className="phone-x" role="img" aria-label="Video preview with voiceover captions">
                <div className={`phone-screen${loading ? " loading" : ""}`}>
                  {photo ? (
                    <>
                      <div className="ps-backdrop" />
                      <div className="ps-photo" style={{ backgroundImage: `url(${JSON.stringify(photo.url)})` }} />
                      <span className="ps-ring" /><span className="ps-ring r2" /><span className="ps-ring r3" />
                      <div className="ps-shade" />
                      <span className="ps-tag">{t.name} · 9:16</span>
                      <span className="ps-wm">ayiko.ai</span>
                      <div className="ps-caption"><p>{caption}</p></div>
                      <div className="ps-wave" aria-hidden="true">
                        {Array.from({ length: 18 }, (_, w) => <span key={w} style={{ animationDelay: `${-((w * 37) % 100) / 100}s` }} />)}
                      </div>
                    </>
                  ) : (
                    <video
                      key={videoSrc}
                      className="ps-video"
                      src={`${videoSrc}.mp4`}
                      poster={`${videoSrc}.jpg`}
                      autoPlay muted loop playsInline
                      aria-label={`${t.name} example video`}
                    />
                  )}
                  {loading && <div className="ps-generating"><span />Generating…</div>}
                  <span className="ps-rec"><i /><span>{photo || useMulti ? lang : show?.lang ?? "twi"}</span></span>
                </div>
              </div>
              <div className="preview-meta">
                <span className="pm-chip">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                  {l.name} · {voice === "male" ? "male" : "female"} voice
                </span>
                <p className="meaning">{meaning}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="platforms-x">
        <span>Made for</span>
        <b>TikTok</b><b>Instagram Reels</b><b>YouTube Shorts</b><b>WhatsApp Status</b>
      </div>

      <div className="ticker-x" role="marquee" aria-label="Welcome in the languages Ayiko speaks">
        <div className="ticker-track">
          {[0, 1].map((copy) => (
            <ul key={copy} aria-hidden={copy === 1 ? true : undefined}>
              {GREETINGS.map(([word, name, code]) => (
                <li key={code}><b lang={code}>{word}</b><span>{name}</span></li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {children}

      <section id="templates" className="block" aria-labelledby="tpl-h">
        <div className="block-head split" data-reveal>
          <div>
            <div className="eyebrow-x">Templates</div>
            <h2 id="tpl-h">Start from a template, <em>not a blank prompt.</em></h2>
          </div>
          <div className="tpl-tools">
            <p className="block-sub">Each one sets the camera move, length and a script starter. Pick one and it fills in the studio above.</p>
            <div className="tpl-controls">
              <div className="toggle" role="radiogroup" aria-label="Layout">
                <button type="button" role="radio" aria-checked={view === "scroll"} className={view === "scroll" ? "on" : ""} onClick={() => setView("scroll")}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="6" height="12" rx="1.5" /><rect x="9.5" y="6" width="6" height="12" rx="1.5" /><path d="M17 6h3.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H17" /></svg>Scroll
                </button>
                <button type="button" role="radio" aria-checked={view === "grid"} className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>Grid
                </button>
              </div>
              {view === "scroll" && (
                <div className="arrows-x">
                  <button type="button" aria-label="Previous templates" disabled={!canPrev} onClick={() => scrollTpl(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
                  <button type="button" aria-label="More templates" disabled={!canNext} onClick={() => scrollTpl(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={view === "scroll" ? "trail" : "tgrid"} ref={railRef} data-reveal tabIndex={view === "scroll" ? 0 : undefined} aria-label={view === "scroll" ? "Templates, scroll sideways for more" : undefined}>
          {TEMPLATES.map((x) => (
            <article className={`tcard${x.ready ? "" : " soon"}`} key={x.id}>
              <div className={`tthumb ${x.tone}`}>
                {SHOWCASE[x.id] ? (
                  <LazyVideo src={`/showcase/${x.id}.mp4`} poster={`/showcase/${x.id}.jpg`} label={`${x.name} example`} />
                ) : (
                  <TemplateIcon name={x.icon} />
                )}
                {x.ready ? <span className="tlang">{langBy(SHOWCASE[x.id]?.lang ?? x.lang).name}</span> : <span className="tsoon">Coming soon</span>}
                <div className="tover">
                  <h3>{x.name}</h3>
                  <p>{x.blurb}</p>
                </div>
              </div>
              <button className="tuse" type="button" disabled={!x.ready} onClick={() => applyTemplate(x.id, SHOWCASE[x.id]?.lang ?? x.lang, true)}>
                {x.ready ? "Use this template" : "In the works"}
                {x.ready && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
              </button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
