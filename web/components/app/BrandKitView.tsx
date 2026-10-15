"use client";

import { useState } from "react";
import { cleanBrandKit, type BrandKit } from "@/lib/brand";
import { LIMITS } from "@/lib/catalog";
import { ACCENTS, HIGHLIGHTS } from "@/lib/design";
import { PreviewFrame } from "./PreviewFrame";
import { PageHead, useAccount } from "./Shell";

function ColourPicker({ id, label, value, presets, onChange }: { id: string; label: string; value: string; presets: string[]; onChange: (v: string) => void }) {
  const custom = !presets.includes(value.toUpperCase());
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      <span>{label}</span>
      {presets.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value.toUpperCase() === c} aria-label={c} className={value.toUpperCase() === c ? "on" : ""} style={{ background: c }} onClick={() => onChange(c)} />
      ))}
      <label className={`swatch-custom${custom ? " on" : ""}`} title="Pick any colour" style={custom ? { background: value } : undefined}>
        <span className="sr-only">Custom {label.toLowerCase()}</span>
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      </label>
      <code className="hex">{value.toUpperCase()}</code>
    </div>
  );
}

export function BrandKitView() {
  const { account, setBrand, toast } = useAccount();
  const [kit, setKit] = useState<BrandKit>(account.brand);
  const [saving, setSaving] = useState(false);
  const [endCard, setEndCard] = useState(false);
  const dirty = JSON.stringify(kit) !== JSON.stringify(account.brand);
  const set = (patch: Partial<BrandKit>) => setKit((k) => ({ ...k, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/brand", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cleanBrandKit(kit)) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setSaving(false);
    if (!res?.ok) { toast(body?.error ?? "We couldn't save your brand kit. Try again."); return; }
    setBrand(body.brand);
    setKit(body.brand);
    toast("Brand kit saved. New videos will use it.", { label: "Make a video", href: "/app" });
  }

  return (
    <>
      <PageHead title="Brand kit" sub="Set your look once. Every new video starts with these colours, captions and end card." />
      <form className="split" onSubmit={save}>
        <div className="panel form-panel">
          <fieldset>
            <legend>End card</legend>
            <div className="field"><label htmlFor="bk-brand">Brand or business name</label><input id="bk-brand" maxLength={LIMITS.brand} value={kit.brandName} placeholder="Mama's Kitchen" onFocus={() => setEndCard(true)} onChange={(e) => set({ brandName: e.target.value })} /></div>
            <div className="field"><label htmlFor="bk-cta">Usual call to action</label><input id="bk-cta" maxLength={LIMITS.cta} value={kit.cta} placeholder="Order on WhatsApp" onFocus={() => setEndCard(true)} onChange={(e) => set({ cta: e.target.value })} /></div>
          </fieldset>
          <fieldset onFocus={() => setEndCard(false)}>
            <legend>Colours</legend>
            <ColourPicker id="bk-accent" label="Brand colour (headline and button)" value={kit.accent} presets={ACCENTS} onChange={(accent) => set({ accent })} />
            <ColourPicker id="bk-highlight" label="Spoken word highlight" value={kit.highlight} presets={HIGHLIGHTS} onChange={(highlight) => set({ highlight })} />
          </fieldset>
          <fieldset onFocus={() => setEndCard(false)}>
            <legend>Captions</legend>
            <div className="seg" role="radiogroup" aria-label="Caption style">
              <button type="button" role="radio" aria-checked={kit.captionStyle === "pop"} className={kit.captionStyle === "pop" ? "on" : ""} onClick={() => set({ captionStyle: "pop" })}>Word pop</button>
              <button type="button" role="radio" aria-checked={kit.captionStyle === "box"} className={kit.captionStyle === "box" ? "on" : ""} onClick={() => set({ captionStyle: "box" })}>White box</button>
            </div>
            <label className="menu-switch"><input id="bk-upper" type="checkbox" checked={kit.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} /><span>Capital letters</span></label>
          </fieldset>
          <div className="form-foot">
            <button type="submit" className="btn" disabled={saving || !dirty}>{saving ? "Saving…" : dirty ? "Save brand kit" : "Saved"}</button>
            {dirty && <button type="button" className="linkish" onClick={() => setKit(account.brand)}>Discard changes</button>}
          </div>
          <p className="muted small">A logo on the end card is coming next. Your saved colours also appear in the editor.</p>
        </div>
        <div className="split-preview">
          <div className="stage-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!endCard} className={!endCard ? "on" : ""} onClick={() => setEndCard(false)}>Video</button>
            <button type="button" role="tab" aria-selected={endCard} className={endCard ? "on" : ""} onClick={() => setEndCard(true)}>End card</button>
          </div>
          <PreviewFrame photo="/showcase/menu-reel.jpg" headline="Today’s special" script="Jollof rice and grilled fish. Order now, delivered hot!"
            brand={kit.brandName || "Your brand"} cta={kit.cta || "Order now"} design={{ accent: kit.accent, highlight: kit.highlight, uppercase: kit.uppercase }}
            captionStyle={kit.captionStyle} watermark={false} endCard={endCard} />
          <p className="muted small preview-note">Sample photo · your own photo is used in real videos</p>
        </div>
      </form>
    </>
  );
}
