"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { APP_LANGUAGES, APP_TEMPLATES, LIMITS, languageByCode, templateById, type Gender } from "@/lib/catalog";
import { quoteGeneration } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Icon } from "./icons";
import { PreviewFrame } from "./PreviewFrame";
import { useAccount } from "./Shell";

interface Photo { key?: string; preview: string; name: string; uploading: boolean; error?: string; remote?: boolean }

/** Settings to start from: a template link, or "Duplicate" on an earlier video. */
export interface Seed {
  template?: string;
  lang?: string;
  photo?: { key: string; url: string | null };
  scripts?: Record<string, string>;
  headline?: string;
  brandName?: string;
  cta?: string;
  gender?: Gender;
  durationS?: 5 | 10;
  title?: string;
}

const BUCKET = "media";
const SHOWN = ["twi", "en", "yo", "pcm", "ha", "fr"];

export function CreateView({ seed }: { seed: Seed }) {
  const { account, openPlans, setBalance } = useAccount();
  const available = account.status.languages;
  const brandKit = account.brand;

  const firstTpl = templateById(seed.template ?? "") ?? APP_TEMPLATES[0]!;
  const [tplId, setTplId] = useState(firstTpl.id);
  const tpl = templateById(tplId)!;
  const [photo, setPhoto] = useState<Photo | null>(seed.photo ? { key: seed.photo.key, preview: seed.photo.url ?? "", name: "Photo from your earlier video", uploading: false, remote: true } : null);
  const [langs, setLangs] = useState<string[]>(() => {
    const fromSeed = Object.keys(seed.scripts ?? {}).filter((c) => available.includes(c));
    if (fromSeed.length) return fromSeed;
    const want = seed.lang && available.includes(seed.lang) ? seed.lang : available.includes("twi") ? "twi" : available[0];
    return want ? [want] : [];
  });
  const [scripts, setScripts] = useState<Record<string, string>>(seed.scripts ?? {});
  const [focusLang, setFocusLang] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender>(seed.gender ?? firstTpl.defaultGender);
  const [duration, setDuration] = useState<5 | 10>(seed.durationS ?? 5);
  const [headline, setHeadline] = useState(seed.headline ?? firstTpl.headline);
  const [headlineTouched, setHeadlineTouched] = useState(seed.headline !== undefined);
  const [brand, setBrand] = useState(seed.brandName ?? brandKit.brandName);
  const [cta, setCta] = useState(seed.cta ?? brandKit.cta);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [badField, setBadField] = useState("");
  const [view, setView] = useState<"video" | "end">("video");
  const fileRef = useRef<HTMLInputElement>(null);

  // Script assistant
  const [showAssist, setShowAssist] = useState(false);
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState("");
  const [assisting, setAssisting] = useState<"" | "draft" | "translate">("");
  const [assistError, setAssistError] = useState("");
  const [aiLangs, setAiLangs] = useState<string[]>([]);

  async function assist(body: Record<string, unknown>) {
    const res = await fetch("/api/assist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error ?? "The script assistant is busy. Try again.");
    return out;
  }

  async function translateInto(source: string, targets: string[]) {
    if (!source.trim() || !targets.length) return;
    setAssisting("translate");
    try {
      const { translations } = await assist({ mode: "translate", text: source, to: targets });
      setScripts((cur) => {
        const next = { ...cur };
        for (const t of translations as { code: string; text: string }[]) next[t.code] = t.text;
        return next;
      });
      setAiLangs((cur) => [...new Set([...cur, ...targets])]);
    } catch (err) {
      setAssistError(err instanceof Error ? err.message : "Translation failed.");
    } finally {
      setAssisting("");
    }
  }

  async function writeForMe() {
    setAssistError("");
    setAssisting("draft");
    try {
      const { script } = await assist({ mode: "draft", brief, template: tplId, brand, cta });
      setDraft(script);
      if (langs.includes("en")) setScripts((cur) => ({ ...cur, en: script }));
      setAssisting("");
      await translateInto(script, langs.filter((c) => c !== "en"));
    } catch (err) {
      setAssistError(err instanceof Error ? err.message : "The script assistant is busy.");
      setAssisting("");
    }
  }

  const englishSource = (scripts.en ?? "").trim() || draft;

  useEffect(() => () => { if (photo && !photo.remote) URL.revokeObjectURL(photo.preview); }, [photo]);

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
  const short = quote.total > account.balance;
  const blocker =
    !photo ? "Add a photo" :
    photo.uploading ? "Uploading your photo…" :
    photo.error || !photo.key ? "Add your photo again" :
    !langs.length ? "Pick a language" :
    missingScript ? `Write the ${languageByCode(missingScript)?.name} script` :
    tooLong ? `Shorten the ${languageByCode(tooLong)?.name} script` :
    short ? `You need ${quote.total} credits (you have ${account.balance})` : "";

  const previewLang = focusLang && langs.includes(focusLang) ? focusLang : langs[0];
  const previewScript = (previewLang && scripts[previewLang]) || (previewLang === "en" ? tpl.scriptStarter : languageByCode(previewLang ?? "")?.example) || tpl.scriptStarter;

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
          captionStyle: brandKit.captionStyle,
          design: { accent: brandKit.accent, highlight: brandKit.highlight, uppercase: brandKit.uppercase },
          languages: langs.map((code) => ({ code, script: scripts[code] ?? "" })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(body.error ?? "Something went wrong. You weren't charged.");
        if (body.field) setBadField(body.field);
        if (res.status === 401) window.location.href = "/login?next=/app";
        setSubmitting(false);
        return;
      }
      setBalance(body.balance);
      const q = new URLSearchParams({ started: String(langs.length), charged: String(body.charged), online: body.studioOnline ? "1" : "0" });
      window.location.href = `/app/videos?${q}`;
    } catch {
      setFormError("Check your connection and try again. You weren't charged.");
      setSubmitting(false);
    }
  }

  return (
    <form className="create-screen" onSubmit={generate} noValidate aria-labelledby="create-h">
      <div className="create-steps">
        <div className="page-head">
          <div>
            <h1 id="create-h">{seed.title ? `New version of “${seed.title}”` : "Create a video"}</h1>
            <p className="muted">One photo and a short script become a captioned 9:16 video with a voiceover.</p>
          </div>
        </div>

        <section className="step" aria-labelledby="s-photo">
          <h2 id="s-photo"><span className="n">1</span>Photo</h2>
          <div
            className={`drop${photo ? " has" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files?.[0]); }}
          >
            {photo ? (
              <>
                {photo.preview ? <img src={photo.preview} alt="Your photo" /> : <span className="drop-thumb"><Icon name="image" /></span>}
                <div className="drop-meta">
                  <b>{photo.name.length > 34 ? photo.name.slice(0, 32) + "…" : photo.name}</b>
                  <span className={photo.error ? "err" : "muted"}>{photo.uploading ? "Uploading…" : photo.error ?? "Ready"}</span>
                  <button type="button" className="linkish" onClick={() => fileRef.current?.click()}>Change photo</button>
                </div>
              </>
            ) : (
              <button type="button" className="drop-btn" onClick={() => fileRef.current?.click()}>
                <Icon name="image" size={30} />
                <b>Add a photo</b>
                <span>{tpl.photoHint} JPG, PNG or WebP, up to 10 MB. You can also drop it here.</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </section>

        <section className="step" aria-labelledby="s-tpl">
          <h2 id="s-tpl"><span className="n">2</span>Template <a className="step-link" href="/app/templates">See all with samples</a></h2>
          <div className="tpl-strip" role="radiogroup" aria-label="Template">
            {APP_TEMPLATES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={t.id === tplId} className={`tpl${t.id === tplId ? " on" : ""}`} onClick={() => pickTemplate(t.id)}>
                <img src={`/showcase/${t.id}.jpg`} alt="" loading="lazy" />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="step" aria-labelledby="s-lang">
          <h2 id="s-lang"><span className="n">3</span>Languages <small>up to {LIMITS.languages}, each extra one costs less</small></h2>
          <div className="chips">
            {APP_LANGUAGES.filter((l) => available.includes(l.code) || SHOWN.includes(l.code)).map((l) => {
              const ok = available.includes(l.code);
              const on = langs.includes(l.code);
              return (
                <button key={l.code} type="button" className={`chip-btn${on ? " on" : ""}`} aria-pressed={on} disabled={!ok} onClick={() => toggleLang(l.code)} title={ok ? "" : "Coming soon"}>
                  {l.name}{!ok && <small>soon</small>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="step" aria-labelledby="s-script">
          <h2 id="s-script"><span className="n">4</span>What should the voice say?</h2>
          {!langs.length && <p className="muted small">Pick a language above, then write the script in that language.</p>}
          {account.assist && langs.length > 0 && (
            <div className={`assist${showAssist ? " open" : ""}`}>
              {!showAssist ? (
                <button type="button" className="assist-open" onClick={() => setShowAssist(true)}>
                  <Icon name="spark" size={16} />
                  Write it for me{langs.some((c) => c !== "en") ? " and translate" : ""}
                </button>
              ) : (
                <>
                  <label htmlFor="brief">What are you promoting?</label>
                  <textarea id="brief" rows={2} maxLength={600} value={brief} onChange={(e) => setBrief(e.target.value)}
                    placeholder="Shea butter, 50 cedis a jar, delivery in Accra, order on WhatsApp" />
                  <div className="assist-row">
                    <button type="button" className="btn small-btn" disabled={assisting !== "" || brief.trim().length < 8} onClick={() => void writeForMe()}>
                      {assisting === "draft" ? "Writing…" : assisting === "translate" ? "Translating…" : draft ? "Write again" : "Write script"}
                    </button>
                    <button type="button" className="linkish" onClick={() => setShowAssist(false)}>Close</button>
                  </div>
                  {draft && !langs.includes("en") && <p className="draft"><small>English draft</small>{draft}</p>}
                  <p className="err" role="alert">{assistError}</p>
                </>
              )}
            </div>
          )}
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
                  value={v} onFocus={() => { setFocusLang(code); setView("video"); }}
                  onChange={(e) => { setScripts((s) => ({ ...s, [code]: e.target.value })); if (badField === id) setBadField(""); }} />
                {code !== "en" && account.assist && (
                  <div className="script-tools">
                    {aiLangs.includes(code) && <span className="ai-note">AI translation: ask a native speaker to check it before posting.</span>}
                    {englishSource && (
                      <button type="button" className="linkish" disabled={assisting !== ""} onClick={() => void translateInto(englishSource, [code])}>
                        {assisting === "translate" ? "Translating…" : aiLangs.includes(code) ? "Translate again" : "Translate from English"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section className="step" aria-labelledby="s-more">
          <h2 id="s-more"><span className="n">5</span>On-screen text and voice</h2>
          <div className="more-grid">
            <div className="field">
              <label htmlFor="headline">Headline tag</label>
              <input id="headline" maxLength={LIMITS.headline} value={headline} placeholder="New in" onFocus={() => setView("video")} onChange={(e) => { setHeadline(e.target.value); setHeadlineTouched(true); }} />
            </div>
            <div className="field">
              <label htmlFor="brand">Brand or product name</label>
              <input id="brand" maxLength={LIMITS.brand} value={brand} placeholder="AMA Glow Serum" onFocus={() => setView("end")} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cta">Call to action</label>
              <input id="cta" maxLength={LIMITS.cta} value={cta} placeholder="Order on WhatsApp" onFocus={() => setView("end")} onChange={(e) => setCta(e.target.value)} />
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
          <p className="muted small">Colours and caption style come from your <a href="/app/brand">brand kit</a>.</p>
        </section>
      </div>

      <aside className="create-preview" aria-label="Preview">
        <div className="stage-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === "video"} className={view === "video" ? "on" : ""} onClick={() => setView("video")}>Video</button>
          <button type="button" role="tab" aria-selected={view === "end"} className={view === "end" ? "on" : ""} onClick={() => setView("end")}>End card</button>
        </div>
        <PreviewFrame
          photo={photo?.preview || null}
          headline={headline}
          script={previewScript}
          brand={brand}
          cta={cta}
          design={{ accent: brandKit.accent, highlight: brandKit.highlight, uppercase: brandKit.uppercase }}
          captionStyle={brandKit.captionStyle}
          watermark={!account.paying}
          endCard={view === "end"}
        />
        <p className="muted small preview-note">
          {previewLang ? `${languageByCode(previewLang)?.name} preview` : "Preview"} · the AI adds motion to your photo in the final video
        </p>
        <div className="go">
          <div className="quote">
            {langs.length > 1
              ? <span>{langs.map((c, i) => `${languageByCode(c)?.name} ${quote.perLanguage[i]}`).join(" · ")}</span>
              : <span>Voice, AI clip, captions</span>}
            <b>{quote.total} credits</b>
          </div>
          <button className="btn wide" type="submit" disabled={Boolean(blocker) || submitting || !available.length}>
            {submitting ? "Starting…" : blocker || `Generate ${langs.length > 1 ? `${langs.length} videos` : "video"}`}
          </button>
          {short && (account.billing.enabled
            ? <button type="button" className="linkish" onClick={openPlans}>Buy more credits</button>
            : <p className="muted small">Buying credits opens soon.</p>)}
          <p className="err" role="alert">{formError}</p>
        </div>
      </aside>
    </form>
  );
}
