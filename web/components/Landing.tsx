"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "./Icons";
import { LazyVideo } from "./LazyVideo";
import { Studio } from "./Studio";
import { MULTI_LANGS, PLANS, langBy } from "@/lib/content";

export function Landing() {
  const [scrolled, setScrolled] = useState(false);

  // Frosted nav once the page scrolls
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Gentle reveal as sections enter the viewport (skipped for reduced motion)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    els.forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("in");
      else io.observe(el);
    });
    document.documentElement.classList.add("reveal-ready");
    return () => io.disconnect();
  }, []);

  return (
    <div className="wrap">
      <header className={`nav${scrolled ? " scrolled" : ""}`}>
        <a className="logo" href="#top" aria-label="Ayiko home">
          <LogoMark />
          <span>ayiko<em>.ai</em></span>
        </a>
        <nav className="links" aria-label="Sections">
          <a href="#templates">Templates</a>
          <a href="#multiplier">Language Multiplier</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="nav-cta"><a className="nav-login" href="/login">Log in</a><a className="btn" href="/app">Start free</a></div>
      </header>

      <main id="top">
        <Studio />


        <section id="multiplier" aria-labelledby="multi-h">
          <div className="multi" data-reveal>
            <div>
              <div className="eyebrow">Language Multiplier</div>
              <h2 id="multi-h">One video. <em>Every language</em> your customers speak.</h2>
              <p className="sub">
                Ayiko makes the AI clip once, then adds each language with its own voice and captions. Extra languages
                cost a fraction of a new video.
              </p>
              <div className="calc" aria-label="Example cost">
                <div><span>First language, with the AI clip</span><span>13 credits</span></div>
                <div><span>Each extra language</span><span>3 credits</span></div>
                <div className="total"><span>4 languages</span><span>22 credits</span></div>
                <div className="save"><span>Four separate videos would cost</span><span>52 credits</span></div>
              </div>
            </div>
            <div className="wall" aria-label="The same video in six languages">
              {MULTI_LANGS.map((code) => (
                <div className="mini" key={code}>
                  <LazyVideo src={`/showcase/multi-${code}.mp4`} poster={`/showcase/multi-${code}.jpg`} label={`The same video in ${langBy(code).name}`} />
                  <b>{langBy(code).name}</b>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="how-h">
          <div className="eyebrow">How it works</div>
          <h2 id="how-h">From one photo to a finished video <em>in minutes</em></h2>
          <ol className="steps" data-reveal>
            <li><h3>Describe and upload</h3><p>Pick a template, add your product photo or flyer, and write what you want said. Or let Ayiko suggest the words.</p></li>
            <li><h3>Choose voices</h3><p>Select one language or several, and a voice that sounds like your customers.</p></li>
            <li><h3>Post everywhere</h3><p>Download captioned videos for TikTok, Reels, YouTube Shorts and WhatsApp Status. Regenerate any one with a tap.</p></li>
          </ol>
        </section>

        <section aria-labelledby="lang-h">
          <div className="eyebrow">Languages</div>
          <h2 id="lang-h">Starting with the voices <em>other tools ignore</em></h2>
          <p className="sub">Every voice is tested with native speakers before it goes live.</p>
          <div className="table-wrap" data-reveal>
            <table>
              <thead><tr><th>Language</th><th>Code</th><th>Spoken in</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td>English</td><td><code>en</code></td><td>Worldwide</td><td><span className="st live">At launch</span></td></tr>
                <tr><td>Twi (Asante, Akuapem)</td><td><code>twi</code></td><td>Ghana</td><td><span className="st live">At launch</span></td></tr>
                <tr><td>Yoruba</td><td><code>yo</code></td><td>Nigeria, Benin</td><td><span className="st live">At launch</span></td></tr>
                <tr><td>Nigerian Pidgin</td><td><code>pcm</code></td><td>Nigeria, diaspora</td><td><span className="st live">At launch</span></td></tr>
                <tr><td>Hausa</td><td><code>ha</code></td><td>Nigeria, Niger, Ghana</td><td><span className="st">Next</span></td></tr>
                <tr><td>French</td><td><code>fr</code></td><td>West and Central Africa</td><td><span className="st">Next</span></td></tr>
                <tr><td>Swahili, Igbo, Ewe, Ga</td><td><code>sw · ig · ee · gaa</code></td><td>East and West Africa</td><td><span className="st">Later</span></td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="pricing" aria-labelledby="price-h">
          <div className="eyebrow">Pricing</div>
          <h2 id="price-h">Pay for what you make. <em>No surprises.</em></h2>
          <p className="sub">
            A full video is about 13 credits; an extra language about 3. Failed videos are refunded automatically.
          </p>
          <div className="plans" data-reveal>
            {PLANS.map((p) => (
              <a key={p.id} className={`plan${p.popular ? " pop" : ""}`} href={`/app?plan=${p.id}`} aria-label={`${p.cta}: ${p.name}, ${p.price} ${p.period}, ${p.credits}`}>
                {p.popular && <span className="badge">Most popular</span>}
                <h3>{p.name}</h3>
                <div className="price">{p.price} {p.period && <small>{p.period}</small>}</div>
                <p className="plan-credits">{p.credits}</p>
                <ul>{p.perks.map((k) => <li key={k}>{k}</li>)}</ul>
                <span className={`plan-cta${p.popular ? " primary" : ""}`}>{p.cta}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
              </a>
            ))}
          </div>
          <p className="fine">Prices in GBP. Every account starts with 20 free credits; paid plans can be picked now and card payment opens shortly.</p>
        </section>

        <section aria-labelledby="name-h">
          <div className="story" data-reveal>
            <div className="word" id="name-h">Ayekoo<small>&ldquo;well done&rdquo;</small></div>
            <p>
              Ayiko comes from <i>ayekoo</i>, what people say when work is done well.{" "}
              <strong>Most AI video tools speak English, Spanish and Mandarin. Very few can say &ldquo;Akwaaba&rdquo; properly.</strong>{" "}
              Ayiko is built for the languages the big tools skip, and it works for everyone.
            </p>
          </div>
        </section>

        <section className="join" id="join" aria-labelledby="join-h" data-reveal>
          <div>
            <div className="eyebrow">Start free</div>
            <h2 id="join-h">Make your first video <em>in minutes</em></h2>
            <p className="sub">Sign up with Google or your email and get 20 free credits, enough for your first video. No card needed.</p>
            <ul className="perks">
              <li>20 free credits when you sign up</li>
              <li>Failed videos are refunded automatically</li>
              <li>Download and post anywhere: TikTok, Reels, Shorts, WhatsApp</li>
            </ul>
          </div>
          <div className="start-card">
            <img src="/showcase/multi-twi.jpg" alt="" />
            <div>
              <b>Your photo, your language</b>
              <p>Upload a photo, write what the voice should say, press Generate.</p>
              <a className="btn wide-cta" href="/app">Start free</a>
              <a className="nav-login" href="/login">I already have an account</a>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="foot-brand">
          <a className="logo" href="#top" aria-label="Ayiko home"><LogoMark /><span>ayiko<em>.ai</em></span></a>
          <span>Make the video. Speak their language.</span>
        </div>
        <nav className="foot-links" aria-label="Footer">
          <a href="#templates">Templates</a>
          <a href="#multiplier">Multiplier</a>
          <a href="#pricing">Pricing</a>
          <a href="/app">Start free</a>
        </nav>
        <p className="foot-note">© 2026 Ayiko.ai · Edinburgh, Scotland · Showcase videos were made with Ayiko&apos;s engine.</p>
      </footer>
    </div>
  );
}
