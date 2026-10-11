"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoMark } from "../Icons";
import { APP_LANGUAGES, APP_TEMPLATES, LIMITS, languageByCode, templateById, type Gender } from "@/lib/catalog";
import { quoteGeneration } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { StudioStatus, VideoItem } from "@/lib/studio";

interface Data { videos: VideoItem[]; balance: number; status: StudioStatus }
interface Photo { key?: string; preview: string; name: string; uploading: boolean; error?: string }

const BUCKET = "media";

const STEP_LABEL: Record<string, string> = {
  voice: "Recording the voiceover",
  video: "Animating your photo",
  render: "Adding captions",
};

function statusLine(v: VideoItem) {
  if (v.status === "queued") return v.waitingForFirst ? "Waiting for the first language" : "In the queue";
  if (v.status === "running") return v.step ? STEP_LABEL[v.step] ?? "Working on it" : "Starting";
  if (v.status === "failed") return "Didn't work";
  return "Ready";
}

const timeAgo = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

export function AppStudio({ initial, user, start }: {
  initial: Data;
  user: { name: string; email: string; avatar: string | null };
  start: { template?: string; lang?: string };
}) {
  const [data, setData] = useState<Data>(initial);
  const available = data.status.languages;

  const firstTpl = templateById(start.template ?? "") ?? APP_TEMPLATES[0]!;
  const [tplId, setTplId] = useState(firstTpl.id);
  const tpl = templateById(tplId)!;
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [langs, setLangs] = useState<string[]>(() => {
    const want = start.lang && available.includes(start.lang) ? start.lang : available.includes("twi") ? "twi" : available[0];
    return want ? [want] : [];
  });
  const [scripts, setScripts] = useState<Record<string, string>>({});
  const [gender, setGender] = useState<Gender>(firstTpl.defaultGender);
  const [duration, setDuration] = useState<5 | 10>(5);
  const [headline, setHeadline] = useState(firstTpl.headline);
  const [headlineTouched, setHeadlineTouched] = useState(false);
  const [brand, setBrand] = useState("");
  const [cta, setCta] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [badField, setBadField] = useState("");
  const [toast, setToast] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const videosRef = useRef<HTMLElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/videos", { cache: "no-store" });
      if (res.status === 401) { window.location.href = "/login?next=/app"; return; }
      if (res.ok) setData(await res.json());
    } catch { /* offline: try again next tick */ }
  }, []);

  // Poll while anything is being made; refresh when the tab comes back into view.
  const busy = data.videos.some((v) => v.status === "queued" || v.status === "running");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [busy, refresh]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [refresh]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 5000); return () => clearTimeout(t); }, [toast]);

  function pickTemplate(id: string) {
    const t = templateById(id)!;
    setTplId(id);
    setGender(t.defaultGender);
    if (!headlineTouched) setHeadline(t.headline);
  }

  function toggleLang(code: string) {
    setFormError("");
    setLangs((cur) => cur.includes(code) ? cur.filter((c) => c !== code) : cur.length >= LIMITS.languages ? cur : [...cur, code]);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFormError("");
    if (!LIMITS.photoTypes.includes(file.type)) { setPhoto(null); setFormError("Use a JPG, PNG or WebP photo."); return; }
    if (file.size > LIMITS.photoBytes) { setPhoto(null); setFormError("Photos can be up to 10 MB."); return; }
    const p: Photo = { preview: URL.createObjectURL(file), name: file.name, uploading: true };
    setPhoto(p);
    try {
      const res = await fetch("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: file.type, size: file.size }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed.");
      const { error } = await supabaseBrowser().storage.from(BUCKET).uploadToSignedUrl(body.path, body.token, file, { contentType: file.type });
      if (error) throw new Error("Upload failed. Check your connection and try again.");
      setPhoto((cur) => (cur?.preview === p.preview ? { ...cur, key: body.path, uploading: false } : cur));
    } catch (err) {
      setPhoto((cur) => (cur?.preview === p.preview ? { ...cur, uploading: false, error: err instanceof Error ? err.message : "Upload failed." } : cur));
    }
  }

  const quote = useMemo(() => quoteGeneration(langs.map((c) => scripts[c] ?? ""), duration), [langs, scripts, duration]);
  const missingScript = langs.find((c) => !(scripts[c] ?? "").trim());
  const tooLong = langs.find((c) => (scripts[c] ?? "").length > LIMITS.scriptChars);
  const short = quote.total > data.balance;
  const blocker =
    !photo ? "Add a photo" :
    photo.uploading ? "Uploading your photo…" :
    photo.error || !photo.key ? "Add your photo again" :
    !langs.length ? "Pick a language" :
    missingScript ? `Write the ${languageByCode(missingScript)?.name} script` :
    tooLong ? `Shorten the ${languageByCode(tooLong)?.name} script` :
    short ? `You need ${quote.total} credits (you have ${data.balance})` : "";

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (blocker || submitting || !photo?.key) return;
    setSubmitting(true);
    setFormError("");
    setBadField("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageKey: photo.key, template: tplId, gender, videoDurationS: duration,
          headline, brandName: brand, cta,
          languages: langs.map((code) => ({ code, script: scripts[code] ?? "" })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(body.error ?? "Something went wrong. You weren't charged.");
        if (body.field) setBadField(body.field);
        if (res.status === 401) window.location.href = "/login?next=/app";
        return;
      }
      setData((d) => ({ ...d, balance: body.balance }));
      setToast(`Started ${langs.length === 1 ? "your video" : `${langs.length} videos`} · ${body.charged} credits. ${body.studioOnline ? "It usually takes 2–4 minutes." : "It will start as soon as the studio is back online."}`);
      await refresh();
      if (window.matchMedia("(max-width: 980px)").matches) videosRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch {
      setFormError("Check your connection and try again. You weren't charged.");
    } finally {
      setSubmitting(false);
    }
  }

  const initials = (user.name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");

  return (
    <div className="studio">
      <header className="topbar">
        <a className="logo" href="/" aria-label="Ayiko home"><LogoMark /><span>ayiko<em>.ai</em></span></a>
        <div className="topbar-right">
          <span className={`studio-dot${data.status.online ? " on" : ""}`} title={data.status.online ? "Studio online" : "Studio offline"}>
            <i />{data.status.online ? "Studio online" : "Studio offline"}
          </span>
          <span className="credits" aria-label={`${data.balance} credits`}><b>{data.balance}</b> credits</span>
          <details className="menu">
            <summary aria-label="Account menu">{user.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{initials || "A"}</span>}</summary>
            <div className="menu-pop">
              <p><b>{user.name || "Your account"}</b><br /><small>{user.email}</small></p>
              <form action="/auth/signout" method="post"><button type="submit">Log out</button></form>
            </div>
          </details>
        </div>
      </header>

      {!available.length && (
        <p className="banner">Voices are being set up right now. You can look around; generating opens as soon as the studio is ready.</p>
      )}
      {available.length > 0 && !data.status.online && (
        <p className="banner">The studio is restarting. You can still create videos; they&apos;ll start automatically in a few minutes.</p>
      )}

      <div className="studio-grid">
        <form className="create" onSubmit={generate} noValidate aria-labelledby="create-h">
          <h1 id="create-h">New video</h1>

          <fieldset>
            <legend><span className="n">1</span>Photo</legend>
            <div
              className={`drop${photo ? " has" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files?.[0]); }}
            >
              {photo ? (
                <>
                  <img src={photo.preview} alt="Your photo" />
                  <div className="drop-meta">
                    <b>{photo.name.length > 28 ? photo.name.slice(0, 26) + "…" : photo.name}</b>
                    <span className={photo.error ? "err" : "muted"}>{photo.uploading ? "Uploading…" : photo.error ?? "Uploaded"}</span>
                    <button type="button" className="linkish" onClick={() => fileRef.current?.click()}>Change photo</button>
                  </div>
                </>
              ) : (
                <button type="button" className="drop-btn" onClick={() => fileRef.current?.click()}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M21 16l-5-5-8 8" /></svg>
                  <b>Add a photo</b>
                  <span>{tpl.photoHint} JPG, PNG or WebP, up to 10 MB.</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          </fieldset>

          <fieldset>
            <legend><span className="n">2</span>Template</legend>
            <div className="tpl-row" role="radiogroup" aria-label="Template">
              {APP_TEMPLATES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={t.id === tplId} className={`tpl${t.id === tplId ? " on" : ""}`} onClick={() => pickTemplate(t.id)}>
                  <img src={`/showcase/${t.id}.jpg`} alt="" loading="lazy" />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend><span className="n">3</span>Languages <small>· up to {LIMITS.languages}, each extra one costs less</small></legend>
            <div className="chips">
              {APP_LANGUAGES.filter((l) => available.includes(l.code) || ["twi", "en", "yo", "pcm", "ha", "fr"].includes(l.code)).map((l) => {
                const ok = available.includes(l.code);
                const on = langs.includes(l.code);
                return (
                  <button key={l.code} type="button" className={`chip-btn${on ? " on" : ""}`} aria-pressed={on} disabled={!ok} onClick={() => toggleLang(l.code)} title={ok ? "" : "Coming soon"}>
                    {l.name}{!ok && <small>soon</small>}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend><span className="n">4</span>What should the voice say?</legend>
            {!langs.length && <p className="muted small">Pick a language above, then write the script in that language.</p>}
            {langs.map((code, i) => {
              const l = languageByCode(code)!;
              const v = scripts[code] ?? "";
              const id = `script-${code}`;
              return (
                <div className={`script${badField === id ? " bad" : ""}`} key={code}>
                  <label htmlFor={id}>
                    {l.name}
                    {i === 0 && langs.length > 1 && <span className="tag-lead">makes the AI clip</span>}
                    <span className={`count${v.length > LIMITS.scriptChars ? " over" : ""}`}>{v.length}/{LIMITS.scriptChars}</span>
                  </label>
                  <textarea id={id} rows={3} lang={code === "twi" ? "tw" : code} placeholder={i === 0 && code === "en" ? tpl.scriptStarter : l.example}
                    value={v} onChange={(e) => { setScripts((s) => ({ ...s, [code]: e.target.value })); if (badField === id) setBadField(""); }} />
                </div>
              );
            })}
          </fieldset>

          <details className="more">
            <summary>On-screen text and voice</summary>
            <div className="more-grid">
              <div className="field">
                <label htmlFor="headline">Headline tag</label>
                <input id="headline" maxLength={LIMITS.headline} value={headline} placeholder="New in" onChange={(e) => { setHeadline(e.target.value); setHeadlineTouched(true); }} />
              </div>
              <div className="field">
                <label htmlFor="brand">Brand or product name</label>
                <input id="brand" maxLength={LIMITS.brand} value={brand} placeholder="AMA Glow Serum" onChange={(e) => setBrand(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cta">Call to action</label>
                <input id="cta" maxLength={LIMITS.cta} value={cta} placeholder="Order on WhatsApp" onChange={(e) => setCta(e.target.value)} />
              </div>
              <div className="field">
                <span className="label">Voice</span>
                <div className="seg" role="radiogroup" aria-label="Voice">
                  {(["female", "male"] as const).map((g) => (
                    <button key={g} type="button" role="radio" aria-checked={gender === g} className={gender === g ? "on" : ""} onClick={() => setGender(g)}>{g === "female" ? "Female" : "Male"}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="label">AI clip length</span>
                <div className="seg" role="radiogroup" aria-label="AI clip length">
                  {([5, 10] as const).map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={duration === d} className={duration === d ? "on" : ""} onClick={() => setDuration(d)}>{d} seconds</button>
                  ))}
                </div>
              </div>
            </div>
          </details>

          <div className="go">
            <div className="quote">
              {langs.length > 1 ? (
                <span>{langs.map((c, i) => `${languageByCode(c)?.name} ${quote.perLanguage[i]}`).join(" · ")}</span>
              ) : <span>Voice, AI clip, captions</span>}
              <b>{quote.total} credits</b>
            </div>
            <button className="btn wide" type="submit" disabled={Boolean(blocker) || submitting || !available.length}>
              {submitting ? "Starting…" : blocker || `Generate ${langs.length > 1 ? `${langs.length} videos` : "video"}`}
            </button>
            {short && <p className="muted small">Buying credits opens soon. Free trial credits can&apos;t be topped up yet.</p>}
            <p className="err" role="alert">{formError}</p>
          </div>
        </form>

        <section className="videos" ref={videosRef} aria-labelledby="videos-h">
          <div className="videos-head">
            <h2 id="videos-h">My videos</h2>
            {busy && <span className="muted small live-dot">Updating live</span>}
          </div>
          {data.videos.length === 0 ? (
            <div className="empty-state">
              <img src="/showcase/product-promo.jpg" alt="" />
              <div>
                <h3>Your videos will appear here</h3>
                <p className="muted">Add a photo, pick a language, write what the voice should say, then press Generate. Each video takes about 2–4 minutes.</p>
              </div>
            </div>
          ) : (
            <ul className="vgrid">
              {data.videos.map((v) => (
                <li key={v.id} className={`vcard ${v.status}`}>
                  <div className="vmedia">
                    {v.status === "succeeded" && v.videoUrl ? (
                      <video src={v.videoUrl} poster={v.photoUrl ?? undefined} controls playsInline preload="metadata" />
                    ) : (
                      <>
                        {v.photoUrl && <img src={v.photoUrl} alt="" />}
                        <div className="vstate">
                          {(v.status === "queued" || v.status === "running") && <span className="spinner" aria-hidden="true" />}
                          {v.status === "failed" && <span className="x" aria-hidden="true">!</span>}
                          <b>{statusLine(v)}</b>
                        </div>
                        {(v.status === "queued" || v.status === "running") && <div className="bar"><i /></div>}
                      </>
                    )}
                    <span className="vlang">{languageByCode(v.language)?.name ?? v.language}</span>
                  </div>
                  <div className="vbody">
                    <div className="vtitle"><b>{v.title}</b><span className="muted small">{timeAgo(v.createdAt)}</span></div>
                    {v.status === "failed" ? (
                      <p className="small err">{v.error ?? "This video couldn't be made. Your credits were refunded."}</p>
                    ) : v.status === "succeeded" && v.downloadUrl ? (
                      <a className="btn ghost small-btn" href={v.downloadUrl}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
                        Download
                      </a>
                    ) : (
                      <p className="small muted">{v.credits} credits · refunded automatically if it fails</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className={`toast${toast ? " show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
