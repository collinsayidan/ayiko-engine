"use client";

import { useEffect, useRef, useState } from "react";
import { TemplateIcon } from "./Icons";
import { LazyVideo } from "./LazyVideo";
import { GREETINGS, LANGS, MULTI_LANGS, QUICK, SHOWCASE, TEMPLATES, estimateCredits, langBy, tplBy } from "@/lib/content";

/**
 * Hero "ask box" + live phone preview + template gallery.
 * They share state, so a template card fills the box above.
 */
export function Studio() {
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
    const card = el.querySelector<HTMLElement>(".card");
    const step = card ? card.offsetWidth + 18 : el.clientWidth * 0.8;
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
        ? `${l.name} · same clip, new voice and captions (Language Multiplier)`
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
      document.getElementById("top")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
      setTimeout(() => textRef.current?.focus(), reduce ? 0 : 400);
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
      <div className="hero">
        <div>
          <span className="pill"><i />AI video in African languages · 20 free credits</span>
          <h1>Make the video. <em>Speak their language.</em></h1>
          <p className="lede">
            Describe what you want, add a photo, pick a language. Ayiko makes a ready-to-post video with a natural
            voiceover and captions in <strong>Twi, Yorùbá, Pidgin, Hausa, English</strong> and more.
          </p>

          <form className="ask" onSubmit={generate} noValidate>
            <textarea
              ref={textRef}
              id="ask-text"
              aria-label="What should Ayiko make?"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="A 15-second promo for my shea butter. Say: New stock just landed, order today on WhatsApp."
            />
            <div className="toolbar">
              <label className={`tool${photo ? " has-file" : ""}`} htmlFor="ask-photo">
                <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M21 16l-5-5-8 8" /></svg>
                <span>{photo ? photo.name : "Add photo"}</span>
                <input id="ask-photo" type="file" accept="image/*" hidden onChange={onPhoto} />
              </label>
              <span className="tool">
                <select id="ask-template" aria-label="Template" value={tplId} onChange={(e) => applyTemplate(e.target.value)}>
                  {TEMPLATES.filter((x) => x.ready).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </span>
              <span className="tool">
                <svg viewBox="0 0 24 24"><path d="M3 12h3M7 8v8M11 5v14M15 8v8M19 11v2" /></svg>
                <select id="ask-lang" aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)}>
                  {LANGS.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
                </select>
              </span>
              <span className="tool">
                <select id="ask-voice" aria-label="Voice" value={voice} onChange={(e) => setVoice(e.target.value)}>
                  <option value="female">Female voice</option>
                  <option value="male">Male voice</option>
                </select>
              </span>
              <span className="spacer" />
              <span className="cost">≈ {estimateCredits(idea)} credits</span>
              <button className="btn" type="submit" disabled={loading}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
                Generate
              </button>
            </div>
          </form>
          <div className="quick" aria-label="Example ideas">
            {QUICK.map(([label, id, code]) => (
              <button key={label} type="button" onClick={() => applyTemplate(id, code)}>{label}</button>
            ))}
          </div>
          <p className="notice" aria-live="polite">{notice}</p>
          <p className="platforms"><span>Ready for</span><b>TikTok</b><b>Reels</b><b>YouTube Shorts</b><b>WhatsApp Status</b></p>
        </div>

        <div className="demo">
          <div className="chip c1" aria-hidden="true">
            <span className="ico"><svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg></span>
            <span>Native voice<small>{l.name} · {voice === "male" ? "male" : "female"}</small></span>
          </div>
          <div className="chip c2" aria-hidden="true">
            <span className="ico"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="3" /><path d="M7 12h4M13 12h4M7 15h7" /></svg></span>
            <span>Captions<small>synced word by word</small></span>
          </div>
          <div className="chip c3" aria-hidden="true">
            <span className="ico"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
            <span>Ready to post<small>9:16 · about 15s</small></span>
          </div>
          <div className="phone" role="img" aria-label="Video preview with voiceover captions">
            <div className={`screen${loading ? " loading" : ""}`}>
              <div className="backdrop" />
              {photo ? (
                <>
                  <div className="photo" style={{ backgroundImage: `url(${JSON.stringify(photo.url)})` }} />
                  <span className="ring" /><span className="ring r2" /><span className="ring r3" />
                  <div className="shade" />
                  <span className="tag">{t.name} · 9:16</span>
                  <span className="rec"><i /><span>{l.code}</span></span>
                  <span className="mark-wm">ayiko.ai</span>
                  <div className="caption"><p>{caption}</p></div>
                  <div className="wave" aria-hidden="true">
                    {Array.from({ length: 18 }, (_, w) => <span key={w} style={{ animationDelay: `${-((w * 37) % 100) / 100}s` }} />)}
                  </div>
                </>
              ) : (
                <>
                  <video
                    key={videoSrc}
                    className="screen-video"
                    src={`${videoSrc}.mp4`}
                    poster={`${videoSrc}.jpg`}
                    autoPlay muted loop playsInline
                    aria-label={`${t.name} example video`}
                  />
                  {loading && <div className="generating"><span />Generating…</div>}
                  <span className="rec"><i /><span>{useMulti ? lang : show?.lang ?? "twi"}</span></span>
                </>
              )}
            </div>
          </div>
          <p className="meaning">{meaning}</p>
        </div>
      </div>

      <div className="ticker" role="marquee" aria-label="Welcome in the languages Ayiko speaks">
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

      <section id="templates" aria-labelledby="tpl-h">
        <div className="head-row" data-reveal>
          <div>
            <div className="eyebrow">Templates</div>
            <h2 id="tpl-h">Start from a template, <em>not a blank prompt</em></h2>
          </div>
          <div className="tpl-tools">
            <p className="sub">Each one sets the camera move, length and a script starter. Tap one and it fills in the box above.</p>
            <div className="tpl-controls">
              <div className="view-toggle" role="radiogroup" aria-label="Layout">
                <button type="button" role="radio" aria-checked={view === "scroll"} className={view === "scroll" ? "on" : ""} onClick={() => setView("scroll")}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="6" height="12" rx="1.5" /><rect x="9.5" y="6" width="6" height="12" rx="1.5" /><path d="M17 6h3.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H17" /></svg>Scroll
                </button>
                <button type="button" role="radio" aria-checked={view === "grid"} className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>Grid
                </button>
              </div>
              {view === "scroll" && (
                <div className="arrows">
                  <button type="button" aria-label="Previous templates" disabled={!canPrev} onClick={() => scrollTpl(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
                  <button type="button" aria-label="More templates" disabled={!canNext} onClick={() => scrollTpl(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={view === "scroll" ? "rail" : "grid"} ref={railRef} data-reveal tabIndex={view === "scroll" ? 0 : undefined} aria-label={view === "scroll" ? "Templates, scroll sideways for more" : undefined}>
          {TEMPLATES.map((x) => (
            <article className="card" key={x.id}>
              <div className={`thumb ${x.tone}${SHOWCASE[x.id] ? " has-video" : ""}`}>
                {SHOWCASE[x.id] ? (
                  <LazyVideo src={`/showcase/${x.id}.mp4`} poster={`/showcase/${x.id}.jpg`} label={`${x.name} example`} />
                ) : (
                  <TemplateIcon name={x.icon} />
                )}
                {x.ready ? <span className="lang">{langBy(SHOWCASE[x.id]?.lang ?? x.lang).name}</span> : <span className="soon">Soon</span>}
              </div>
              <div className="card-body">
                <h3>{x.name}</h3>
                <p>{x.blurb}</p>
                <button className="use" type="button" disabled={!x.ready} onClick={() => applyTemplate(x.id, SHOWCASE[x.id]?.lang ?? x.lang, true)}>
                  {x.ready ? "Use template" : "Coming soon"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
