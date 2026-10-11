"use client";

import { useEffect, useRef, useState } from "react";
import { TemplateIcon } from "./Icons";
import { LazyVideo } from "./LazyVideo";
import { LANGS, MULTI_LANGS, QUICK, SHOWCASE, TEMPLATES, estimateCredits, langBy, tplBy } from "@/lib/content";

/**
 * Hero "ask box" + live phone preview + template gallery.
 * They share state, so a template card fills the box above.
 */
export function Studio({ onLanguage }: { onLanguage: (form: string) => void }) {
  const [tplId, setTplId] = useState("product-promo");
  const [lang, setLang] = useState("twi");
  const [voice, setVoice] = useState("female");
  const [idea, setIdea] = useState(tplBy("product-promo").idea);
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<React.ReactNode>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

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
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      setLoading(false);
      onLanguage(l.form);
      setNotice(
        <>
          <b>This is a preview.</b> Real videos start in the private beta. <a href="#join">Join the waitlist</a> and we&apos;ll keep your spot.
        </>,
      );
    }, reduce ? 200 : 1600);
  }

  return (
    <>
      <div className="hero">
        <div>
          <span className="pill"><i />Private beta · AI video in African languages</span>
          <h1>Make the video. <em>Speak their language.</em></h1>
          <p className="lede">
            Describe what you want, add a photo, pick a language. Ayiko makes a ready-to-post video with a natural
            voiceover and captions in Twi, Yoruba, Pidgin, Hausa, English and more.
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
        </div>

        <div className="demo">
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

      <section id="templates" aria-labelledby="tpl-h">
        <div className="head-row">
          <div>
            <div className="eyebrow">Templates</div>
            <h2 id="tpl-h">Start from a template, not a blank prompt</h2>
          </div>
          <p className="sub">Each one sets the camera move, length and a script starter. Tap one and it fills in the box above.</p>
        </div>
        <div className="grid">
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
