"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "./Icons";
import { LazyVideo } from "./LazyVideo";
import { Studio } from "./Studio";
import { MULTI_LANGS, PLANS, langBy } from "@/lib/content";

/** Languages section: live now, then what's coming. Greetings match the hero ticker. */
const LIVE_LANGS: { name: string; hello: string; code: string; where: string }[] = [
  { name: "Twi", hello: "Akwaaba", code: "tw", where: "Ghana · Asante and Akuapem" },
  { name: "Yorùbá", hello: "Ẹ káàbọ̀", code: "yo", where: "Nigeria, Benin" },
  { name: "Nigerian Pidgin", hello: "Welcome o", code: "pcm", where: "Nigeria and the diaspora" },
  { name: "English", hello: "Welcome", code: "en", where: "Worldwide" },
];
const NEXT_LANGS = ["Hausa", "Français"];
const LATER_LANGS = ["Swahili", "Igbo", "Ewe", "Ga"];

const FEATURES: { title: string; body: string; icon: React.ReactNode; wide?: boolean }[] = [
  {
    title: "Voices tested by native speakers",
    body: "Each language is routed to the voice that sounds most natural in it, and every voice is checked by people who grew up speaking it.",
    icon: <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />,
    wide: true,
  },
  {
    title: "Captions that follow the voice",
    body: "Built from your script and timed to the audio, so tone marks like ẹ, ọ and ɛ come out right.",
    icon: <><rect x="3" y="6" width="18" height="12" rx="3" /><path d="M7 12h4M13 12h4M7 15h7" /></>,
  },
  {
    title: "A script assistant",
    body: "Not sure what to say? Ayiko drafts the words for you, or translates your script into other languages.",
    icon: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />,
  },
  {
    title: "Edit after it renders",
    body: "Move the captions, change colours, fix a word, add your brand and a call to action, then render again.",
    icon: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>,
  },
  {
    title: "Failed videos are refunded",
    body: "If anything goes wrong after you press Generate, your credits come straight back. Automatically.",
    icon: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
  },
];

const FAQ: [q: string, a: string][] = [
  ["What do I need to make a video?", "One photo (a product, a flyer, a dish or yourself) and a few sentences of what the voice should say. Ayiko can draft the words for you too."],
  ["How much does a video cost?", "A full 15-second video is about 13 credits. Each extra language for the same video is about 3 credits, because Ayiko reuses the clip and only adds a new voice and captions."],
  ["What happens if a video fails?", "Your credits are refunded automatically. You don't need to contact anyone."],
  ["Which languages can I use today?", "English, Twi, Yorùbá and Nigerian Pidgin, with Hausa and French next. Every voice is tested with native speakers before it goes live."],
  ["Where can I post the videos?", "Anywhere. You download a captioned 9:16 MP4 that is ready for TikTok, Instagram Reels, YouTube Shorts and WhatsApp Status."],
  ["Is there a watermark?", "Free-trial videos carry a small ayiko.ai mark. Every paid plan removes it."],
];

const Arrow = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

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
    <div className="lp">
      <header className={`lp-nav${scrolled ? " scrolled" : ""}`}>
        <div className="lp-nav-in">
          <a className="logo" href="#top" aria-label="Ayiko home">
            <LogoMark />
            <span>ayiko<em>.ai</em></span>
          </a>
          <nav className="lp-links" aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#templates">Templates</a>
            <a href="#languages">Languages</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="lp-nav-cta">
            <a className="nav-login" href="/login">Log in</a>
            <a className="btn" href="/app">Start free</a>
          </div>
        </div>
      </header>

      <main id="top">
        <Studio>
          <section id="how" className="block" aria-labelledby="how-h">
            <div className="block-head center" data-reveal>
              <div className="eyebrow-x">How it works</div>
              <h2 id="how-h">From one photo to a finished video, <em>in minutes.</em></h2>
            </div>
            <ol className="how" data-reveal>
              <li>
                <div className="how-art art-photo" aria-hidden="true">
                  <img src="/showcase/menu-reel.jpg" alt="" loading="lazy" />
                  <span className="art-plus">+</span>
                  <span className="art-script">&ldquo;Today&rsquo;s special is jollof&hellip;&rdquo;</span>
                </div>
                <span className="how-n">01</span>
                <h3>Add a photo and your words</h3>
                <p>Pick a template, upload a product photo or flyer and write what the voice should say. Or let Ayiko suggest the words.</p>
              </li>
              <li>
                <div className="how-art art-voice" aria-hidden="true">
                  <div className="art-langs"><span>Twi</span><span className="on">Yorùbá</span><span>Pidgin</span><span>Hausa</span></div>
                  <div className="art-wave">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ height: `${22 + ((i * 47) % 70)}%` }} />)}</div>
                </div>
                <span className="how-n">02</span>
                <h3>Choose languages and a voice</h3>
                <p>One language or several, each with a natural voice that sounds like your customers.</p>
              </li>
              <li>
                <div className="how-art art-post" aria-hidden="true">
                  <img src="/showcase/multi-yo.jpg" alt="" loading="lazy" />
                  <span className="art-done"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Ready · 9:16</span>
                </div>
                <span className="how-n">03</span>
                <h3>Download and post</h3>
                <p>Captioned videos for TikTok, Reels, Shorts and WhatsApp Status. Edit or regenerate any one with a tap.</p>
              </li>
            </ol>
          </section>
        </Studio>

        <section id="multiplier" className="block" aria-labelledby="multi-h">
          <div className="multi-x" data-reveal>
            <div className="multi-copy">
              <div className="eyebrow-x">Language Multiplier</div>
              <h2 id="multi-h">One video. <em>Every language</em> your customers speak.</h2>
              <p className="block-sub">
                Ayiko makes the AI clip once, then adds each language with its own voice and captions. Extra languages
                cost a fraction of a new video.
              </p>
              <div className="compare" aria-label="Cost of the same video in four languages">
                <div className="cmp-row best">
                  <div className="cmp-label"><span>With the Multiplier</span><b>22 credits</b></div>
                  <div className="cmp-bar"><i style={{ width: `${(22 / 52) * 100}%` }} /></div>
                  <small>13 for the first language, then 3 for each extra one</small>
                </div>
                <div className="cmp-row">
                  <div className="cmp-label"><span>Four separate videos</span><b>52 credits</b></div>
                  <div className="cmp-bar"><i style={{ width: "100%" }} /></div>
                </div>
                <p className="cmp-save"><b>58% less</b> for the same four-language campaign</p>
              </div>
            </div>
            <div className="wall-x" aria-label="The same video in six languages">
              {MULTI_LANGS.map((code) => (
                <figure className="wall-item" key={code}>
                  <LazyVideo src={`/showcase/multi-${code}.mp4`} poster={`/showcase/multi-${code}.jpg`} label={`The same video in ${langBy(code).name}`} />
                  <figcaption>{langBy(code).name}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section id="languages" className="block" aria-labelledby="lang-h">
          <div className="block-head split" data-reveal>
            <div>
              <div className="eyebrow-x">Languages</div>
              <h2 id="lang-h">Starting with the voices <em>other tools ignore.</em></h2>
            </div>
            <p className="block-sub">Every voice is tested with native speakers before it goes live, and new languages are added as they pass.</p>
          </div>
          <div className="langs-x" data-reveal>
            {LIVE_LANGS.map((x) => (
              <div className="lang-tile" key={x.code}>
                <span className="lt-status">Live</span>
                <b lang={x.code}>{x.hello}</b>
                <h3>{x.name}</h3>
                <p>{x.where}</p>
              </div>
            ))}
          </div>
          <div className="lang-roadmap" data-reveal>
            <div><span className="rm-k">Next</span>{NEXT_LANGS.map((n) => <span className="rm-chip" key={n}>{n}</span>)}</div>
            <div><span className="rm-k">Later</span>{LATER_LANGS.map((n) => <span className="rm-chip dim" key={n}>{n}</span>)}</div>
          </div>
        </section>

        <section className="block" aria-labelledby="feat-h">
          <div className="block-head center" data-reveal>
            <div className="eyebrow-x">Built in</div>
            <h2 id="feat-h">Everything you need to <em>post today.</em></h2>
          </div>
          <div className="bento" data-reveal>
            {FEATURES.map((f) => (
              <div className={`bento-item${f.wide ? " wide" : ""}`} key={f.title}>
                <span className="bento-ico"><svg viewBox="0 0 24 24" aria-hidden="true">{f.icon}</svg></span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="block" aria-labelledby="price-h">
          <div className="block-head center" data-reveal>
            <div className="eyebrow-x">Pricing</div>
            <h2 id="price-h">Pay for what you make. <em>No surprises.</em></h2>
            <p className="block-sub">A full video is about 13 credits and an extra language about 3. Failed videos are refunded automatically.</p>
          </div>
          <div className="plans-x" data-reveal>
            {PLANS.map((p) => (
              <a key={p.id} className={`plan-x${p.popular ? " pop" : ""}`} href={`/app?plan=${p.id}`} aria-label={`${p.cta}: ${p.name}, ${p.price} ${p.period}, ${p.credits}`}>
                {p.popular && <span className="plan-badge">Most popular</span>}
                <h3>{p.name}</h3>
                <div className="plan-price">{p.price}{p.period && <small>{p.period}</small>}</div>
                <p className="plan-cr">{p.credits}</p>
                <ul>{p.perks.map((k) => <li key={k}>{k}</li>)}</ul>
                <span className="plan-go">{p.cta}<Arrow /></span>
              </a>
            ))}
          </div>
          <p className="fine-x">Prices in GBP. Every account starts with 20 free credits. Paid plans can be picked now, and card payment opens shortly.</p>
        </section>

        <section className="block" aria-labelledby="name-h">
          <div className="story-x" data-reveal>
            <div className="story-word" id="name-h">
              Ayekoo
              <small>Twi · &ldquo;well done&rdquo;</small>
            </div>
            <div className="story-text">
              <p>
                Ayiko comes from <i>ayekoo</i>, what people say in Ghana when work is done well.
              </p>
              <p className="story-big">
                Most AI video tools speak English, Spanish and Mandarin. Very few can say &ldquo;Akwaaba&rdquo; properly.
              </p>
              <p>Ayiko is built for the languages the big tools skip, and it works for everyone.</p>
            </div>
          </div>
        </section>

        <section className="block" aria-labelledby="faq-h">
          <div className="faq-x">
            <div className="block-head" data-reveal>
              <div className="eyebrow-x">Questions</div>
              <h2 id="faq-h">Good to <em>know.</em></h2>
              <p className="block-sub">Anything else? Sign up and ask from inside the studio.</p>
            </div>
            <div className="faq-list" data-reveal>
              {FAQ.map(([q, a], i) => (
                <details key={q} open={i === 0}>
                  <summary>{q}<span aria-hidden="true" /></summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="final" id="join" aria-labelledby="join-h" data-reveal>
          <div className="final-reel" aria-hidden="true">
            {["multi-twi", "new-arrival", "church-announcement", "menu-reel", "multi-ha"].map((n) => (
              <img key={n} src={`/showcase/${n}.jpg`} alt="" loading="lazy" />
            ))}
          </div>
          <div className="final-copy">
            <h2 id="join-h">Make your first video <em>today.</em></h2>
            <p>Sign up with Google or your email and get 20 free credits, enough for your first video. No card needed.</p>
            <div className="hero-cta">
              <a className="btn btn-lg" href="/app">Start free<Arrow /></a>
              <a className="btn btn-lg ghost" href="/login">I have an account</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="foot-top">
          <div className="foot-brand-x">
            <a className="logo" href="#top" aria-label="Ayiko home"><LogoMark /><span>ayiko<em>.ai</em></span></a>
            <p>Make the video. Speak their language.</p>
          </div>
          <nav className="foot-cols" aria-label="Footer">
            <div>
              <h3>Product</h3>
              <a href="#how">How it works</a>
              <a href="#templates">Templates</a>
              <a href="#multiplier">Language Multiplier</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div>
              <h3>Account</h3>
              <a href="/app">Start free</a>
              <a href="/login">Log in</a>
            </div>
          </nav>
        </div>
        <p className="foot-note-x">© 2026 Ayiko.ai · Edinburgh, Scotland · Showcase videos were made with Ayiko&apos;s engine.</p>
      </footer>
    </div>
  );
}
