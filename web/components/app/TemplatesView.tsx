"use client";

import { APP_TEMPLATES } from "@/lib/catalog";
import { PageHead } from "./Shell";

export function TemplatesView() {
  return (
    <>
      <PageHead title="Templates" sub="Each template sets the camera movement, voice and headline. Hover to play a sample." />
      <ul className="tpl-gallery">
        {APP_TEMPLATES.map((t) => (
          <li key={t.id}>
            <a className="tpl-card" href={`/app?template=${t.id}`}
              onMouseEnter={(e) => { const v = e.currentTarget.querySelector("video"); if (v && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) void v.play().catch(() => {}); }}
              onMouseLeave={(e) => { const v = e.currentTarget.querySelector("video"); if (v) { v.pause(); v.currentTime = 0; } }}>
              <div className="tpl-media">
                <video src={`/showcase/${t.id}.mp4`} poster={`/showcase/${t.id}.jpg`} muted loop playsInline preload="none" />
              </div>
              <div className="tpl-body">
                <b>{t.name}</b>
                <p className="muted small">{t.blurb}</p>
                <span className="tpl-use">Use this template</span>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
