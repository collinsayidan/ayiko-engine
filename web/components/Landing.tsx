"use client";

import { useState } from "react";
import { LogoMark } from "./Icons";
import { LazyVideo } from "./LazyVideo";
import { Studio } from "./Studio";
import { Waitlist } from "./Waitlist";
import { MULTI_LANGS, langBy } from "@/lib/content";

export function Landing() {
  const [wlLang, setWlLang] = useState("Twi");

  return (
    <div className="wrap">
      <header className="nav">
        <a className="logo" href="#top" aria-label="Ayiko home">
          <LogoMark />
          <span>ayiko<em>.ai</em></span>
        </a>
        <nav className="links" aria-label="Sections">
          <a href="#templates">Templates</a>
          <a href="#multiplier">Language Multiplier</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <a className="btn" href="#join">Join the waitlist</a>
      </header>

      <main id="top">
        <Studio onLanguage={setWlLang} />

        <section id="multiplier" aria-labelledby="multi-h">
          <div className="multi">
            <div>
              <div className="eyebrow">Language Multiplier</div>
              <h2 id="multi-h">One video. Every language your customers speak.</h2>
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
          <h2 id="how-h">From one photo to a finished video in minutes</h2>
          <ol className="steps">
            <li><h3>Describe and upload</h3><p>Pick a template, add your product photo or flyer, and write what you want said. Or let Ayiko suggest the words.</p></li>
            <li><h3>Choose voices</h3><p>Select one language or several, and a voice that sounds like your customers.</p></li>
            <li><h3>Post everywhere</h3><p>Download captioned videos for TikTok, Reels, YouTube Shorts and WhatsApp Status. Regenerate any one with a tap.</p></li>
          </ol>
        </section>

        <section aria-labelledby="lang-h">
          <div className="eyebrow">Languages</div>
          <h2 id="lang-h">Starting with the voices other tools ignore</h2>
          <p className="sub">Every voice is tested with native speakers before it goes live.</p>
          <div className="table-wrap">
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
          <h2 id="price-h">Pay for what you make. No surprises.</h2>
          <p className="sub">
            A full video is about 13 credits; an extra language about 3. Failed videos are refunded automatically.
          </p>
          <div className="plans">
            <div className="plan"><h3>Free trial</h3><div className="price">£0</div><ul><li>20 credits once</li><li>About 1 video plus extras</li><li>Small ayiko.ai mark</li></ul></div>
            <div className="plan"><h3>Starter pack</h3><div className="price">£5 <small>one-off</small></div><ul><li>60 credits</li><li>About 4 videos</li><li>No watermark</li></ul></div>
            <div className="plan pop"><span className="badge">Most popular</span><h3>Creator</h3><div className="price">£15 <small>/ month</small></div><ul><li>220 credits a month</li><li>About 16 videos</li><li>Language Multiplier</li></ul></div>
            <div className="plan"><h3>Business</h3><div className="price">£39 <small>/ month</small></div><ul><li>650 credits a month</li><li>About 50 videos</li><li>Priority queue</li></ul></div>
          </div>
          <p className="fine">Planned launch pricing in GBP; final prices are confirmed when the beta opens.</p>
        </section>

        <section aria-labelledby="name-h">
          <div className="story">
            <div className="word" id="name-h">Ayekoo<small>&ldquo;well done&rdquo;</small></div>
            <p>
              Ayiko comes from <i>ayekoo</i>, what people say when work is done well.{" "}
              <strong>Most AI video tools speak English, Spanish and Mandarin. Very few can say &ldquo;Akwaaba&rdquo; properly.</strong>{" "}
              Ayiko is built for the languages the big tools skip, and it works for everyone.
            </p>
          </div>
        </section>

        <section className="join" id="join" aria-labelledby="join-h">
          <div>
            <div className="eyebrow">Early access</div>
            <h2 id="join-h">Be first to make videos with Ayiko</h2>
            <p className="sub">Join the waitlist for the private beta. Beta users get free credits and a say in which languages come next.</p>
          </div>
          <div>
            <Waitlist language={wlLang} setLanguage={setWlLang} />
          </div>
        </section>
      </main>

      <footer>
        <span>© 2026 Ayiko.ai · Edinburgh, Scotland</span>
        <span>Preview captions are examples. Real generation opens in the beta.</span>
      </footer>
    </div>
  );
}
