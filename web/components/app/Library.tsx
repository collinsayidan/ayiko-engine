"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_TEMPLATES, languageByCode } from "@/lib/catalog";
import type { VideoItem } from "@/lib/studio";
import { Icon } from "./icons";
import { PageHead, useAccount } from "./Shell";

const STEPS = ["voice", "video", "render"];
const STEP_LABEL: Record<string, string> = { voice: "Recording the voiceover", video: "Animating your photo", render: "Adding captions" };

const timeAgo = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
const langName = (code: string) => languageByCode(code)?.name ?? code;
const active = (v: VideoItem) => v.status === "queued" || v.status === "running";

function progress(v: VideoItem) {
  if (v.status === "queued") return { label: v.waitingForFirst ? "Waiting for the first language" : "In the queue", step: 0 };
  const i = Math.max(0, STEPS.indexOf(v.step ?? ""));
  return { label: v.step ? STEP_LABEL[v.step] ?? "Working on it" : "Starting", step: i + 1 };
}

interface Group { key: string; projectId: string | null; title: string; createdAt: string; items: VideoItem[] }

function groupVideos(videos: VideoItem[]): Group[] {
  const map = new Map<string, Group>();
  for (const v of videos) {
    const key = v.batchId ?? v.id;
    const g = map.get(key) ?? { key, projectId: v.projectId, title: v.title, createdAt: v.createdAt, items: [] };
    g.items.push(v);
    if (v.createdAt < g.createdAt) g.createdAt = v.createdAt;
    map.set(key, g);
  }
  return [...map.values()];
}

export function Library({ initial, started }: { initial: VideoItem[]; started?: { count: number; charged: number; online: boolean } }) {
  const { setBalance, toast } = useAccount();
  const [videos, setVideos] = useState(initial);
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"new" | "old" | "name">("new");
  const [playing, setPlaying] = useState<VideoItem | null>(null);
  const [renaming, setRenaming] = useState<Group | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/videos", { cache: "no-store" });
      if (res.status === 401) { window.location.href = "/login?next=/app/videos"; return; }
      if (res.ok) { const b = await res.json(); setVideos(b.videos); setBalance(b.balance); }
    } catch { /* offline: try again next tick */ }
  }, [setBalance]);

  const busy = videos.some(active);
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

  // Just came from Create, or back from the editor.
  useEffect(() => {
    const url = new URL(window.location.href);
    const edited = url.searchParams.has("edited");
    ["started", "charged", "online", "edited"].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState(null, "", url.pathname + url.search);
    if (started) toast(`Started ${started.count === 1 ? "your video" : `${started.count} videos`} · ${started.charged} credits. ${started.online ? "It usually takes 2–4 minutes." : "It will start as soon as the studio is back online."}`);
    else if (edited) toast("New version started · 1 credit. It's ready in about a minute.");
  }, [started, toast]);

  // Tell people when something finishes while they're on the page.
  const prev = useRef(videos);
  useEffect(() => {
    const done = videos.filter((v) => v.status === "succeeded" && prev.current.some((p) => p.id === v.id && active(p)));
    if (done.length) toast(done.length === 1 ? `“${done[0]!.title}” in ${langName(done[0]!.language)} is ready.` : `${done.length} videos are ready.`);
    prev.current = videos;
  }, [videos, toast]);

  const langsUsed = useMemo(() => [...new Set(videos.map((v) => v.language))], [videos]);
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    let gs = groupVideos(videos).filter((g) =>
      (!term || g.title.toLowerCase().includes(term)) &&
      (lang === "all" || g.items.some((v) => v.language === lang)) &&
      (status === "all" || g.items.some((v) => (status === "making" ? active(v) : v.status === status))));
    if (sort === "old") gs = [...gs].reverse();
    if (sort === "name") gs = [...gs].sort((a, b) => a.title.localeCompare(b.title));
    return gs;
  }, [videos, q, lang, status, sort]);

  async function rename(g: Group, title: string) {
    if (!g.projectId) return;
    const res = await fetch(`/api/projects/${g.projectId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (!res?.ok) { toast(body?.error ?? "We couldn't rename it. Try again."); return; }
    setVideos((vs) => vs.map((v) => (v.projectId === g.projectId ? { ...v, title: body.title } : v)));
    setRenaming(null);
  }

  async function remove(g: Group) {
    if (!g.projectId) return;
    const res = await fetch(`/api/projects/${g.projectId}`, { method: "DELETE" }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (!res?.ok) { toast(body?.error ?? "We couldn't delete it. Try again."); return; }
    setVideos((vs) => vs.filter((v) => v.projectId !== g.projectId));
    setDeleting(null);
    toast(`Deleted “${g.title}”.`);
  }

  const total = groupVideos(videos).length;

  return (
    <>
      <PageHead title="My videos" sub={total ? `${total} video${total === 1 ? "" : "s"}${busy ? " · updating live" : ""}` : undefined}>
        <a className="btn" href="/app"><Icon name="plus" size={16} />New video</a>
      </PageHead>

      {total === 0 ? (
        <div className="empty-lib">
          <div>
            <h2>Make your first video</h2>
            <p className="muted">Add a photo, pick a language, write what the voice should say. Each video takes about 2–4 minutes. Start from one of these:</p>
          </div>
          <ul className="sample-row">
            {APP_TEMPLATES.slice(0, 3).map((t) => (
              <li key={t.id}>
                <a href={`/app?template=${t.id}`} className="sample">
                  <video src={`/showcase/${t.id}.mp4`} poster={`/showcase/${t.id}.jpg`} muted loop playsInline autoPlay preload="none" />
                  <span><b>{t.name}</b>Make one like this</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="toolbar" role="search">
            <label className="search">
              <Icon name="search" size={16} />
              <span className="sr-only">Search videos</span>
              <input id="lib-search" type="search" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <label className="sr-only" htmlFor="lib-lang">Language</label>
            <select id="lib-lang" value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="all">All languages</option>
              {langsUsed.map((c) => <option key={c} value={c}>{langName(c)}</option>)}
            </select>
            <label className="sr-only" htmlFor="lib-status">Status</label>
            <select id="lib-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Any status</option>
              <option value="succeeded">Ready</option>
              <option value="making">Being made</option>
              <option value="failed">Didn&apos;t work</option>
            </select>
            <label className="sr-only" htmlFor="lib-sort">Sort</label>
            <select id="lib-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="new">Newest first</option>
              <option value="old">Oldest first</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>

          {groups.length === 0
            ? <p className="muted">No videos match. <button type="button" className="linkish" onClick={() => { setQ(""); setLang("all"); setStatus("all"); }}>Clear filters</button></p>
            : (
              <ul className="lib-grid">
                {groups.map((g) => <Card key={g.key} group={g} onPlay={setPlaying} onRename={() => setRenaming(g)} onDelete={() => setDeleting(g)} />)}
              </ul>
            )}
        </>
      )}

      <Player video={playing} onClose={() => setPlaying(null)} />
      <RenameDialog group={renaming} onClose={() => setRenaming(null)} onSave={rename} />
      <DeleteDialog group={deleting} onClose={() => setDeleting(null)} onConfirm={remove} />
    </>
  );
}

function Card({ group, onPlay, onRename, onDelete }: { group: Group; onPlay: (v: VideoItem) => void; onRename: () => void; onDelete: () => void }) {
  const [sel, setSel] = useState(group.items[0]!.id);
  const v = group.items.find((x) => x.id === sel) ?? group.items[0]!;
  const vidRef = useRef<HTMLVideoElement>(null);
  const [dur, setDur] = useState<number | null>(null);
  const anyActive = group.items.some(active);
  const failed = v.status === "failed";

  const hoverPlay = () => { const el = vidRef.current; if (el && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) void el.play().catch(() => {}); };
  const hoverStop = () => { const el = vidRef.current; if (el) { el.pause(); el.currentTime = 0; } };

  return (
    <li className={`lcard${failed ? " failed" : ""}`}>
      <div className="lmedia" onMouseEnter={hoverPlay} onMouseLeave={hoverStop}>
        {v.status === "succeeded" && v.videoUrl ? (
          <button type="button" className="lplay" onClick={() => onPlay(v)} aria-label={`Play ${group.title} in ${langName(v.language)}`}>
            <video ref={vidRef} src={v.videoUrl} poster={v.photoUrl ?? undefined} muted loop playsInline preload="metadata" onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} />
            <span className="lplay-icon"><Icon name="play" size={18} /></span>
            {dur !== null && Number.isFinite(dur) && <span className="ldur">0:{String(Math.round(dur)).padStart(2, "0")}</span>}
          </button>
        ) : (
          <>
            {v.photoUrl && <img src={v.photoUrl} alt="" />}
            <div className="vstate">
              {active(v) ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  <b>{progress(v).label}</b>
                  {progress(v).step > 0 && <small>Step {progress(v).step} of 3</small>}
                </>
              ) : (
                <><span className="x" aria-hidden="true">!</span><b>Didn&apos;t work</b></>
              )}
            </div>
            {active(v) && <div className="bar"><i style={progress(v).step ? { width: `${(progress(v).step / 3) * 100}%`, animation: "none", transform: "none" } : undefined} /></div>}
          </>
        )}
      </div>

      <div className="lbody">
        <div className="ltitle">
          <b title={group.title}>{group.title}</b>
          <details className="kebab">
            <summary aria-label={`More actions for ${group.title}`}><Icon name="more" /></summary>
            <div className="kebab-pop">
              {v.downloadUrl && <a href={v.downloadUrl}><Icon name="download" size={16} />Download {langName(v.language)}</a>}
              {v.status === "succeeded" && <a href={`/app/edit/${v.id}`}><Icon name="edit" size={16} />Edit look</a>}
              <a href={`/app?from=${v.id}`}><Icon name="copy" size={16} />Duplicate</a>
              <button type="button" onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; onRename(); }}><Icon name="type" size={16} />Rename</button>
              <button type="button" className="danger" disabled={anyActive} title={anyActive ? "You can delete it once it's finished" : undefined} onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; onDelete(); }}><Icon name="trash" size={16} />Delete</button>
            </div>
          </details>
        </div>
        <div className="lmeta muted small">{timeAgo(group.createdAt)} · {group.items.reduce((a, x) => a + x.credits, 0)} credits</div>
        <div className="lpills" role="tablist" aria-label="Languages">
          {group.items.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === v.id} className={`lpill ${x.status}${x.id === v.id ? " on" : ""}`} onClick={() => setSel(x.id)}>
              <i aria-hidden="true" />{langName(x.language)}
            </button>
          ))}
        </div>
        {failed && <p className="small err">{v.error ?? "This video couldn't be made. Your credits were refunded."}</p>}
        {v.status === "succeeded" && v.downloadUrl && (
          <div className="vactions">
            <a className="btn ghost small-btn" href={v.downloadUrl}><Icon name="download" size={16} />Download</a>
            <a className="btn ghost small-btn" href={`/app/edit/${v.id}`}><Icon name="edit" size={16} />Edit</a>
          </div>
        )}
      </div>
    </li>
  );
}

function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return ref;
}

function Player({ video, onClose }: { video: VideoItem | null; onClose: () => void }) {
  const ref = useDialog(Boolean(video));
  return (
    <dialog ref={ref} className="player-dialog" onClose={onClose} aria-label={video ? `${video.title} in ${langName(video.language)}` : "Player"}>
      {video?.videoUrl && <video src={video.videoUrl} poster={video.photoUrl ?? undefined} controls autoPlay playsInline />}
      {video && (
        <div className="player-bar">
          <div><b>{video.title}</b><span className="muted small"> · {langName(video.language)}</span></div>
          <div className="player-actions">
            {video.downloadUrl && <a className="btn small-btn" href={video.downloadUrl}><Icon name="download" size={16} />Download</a>}
            <a className="btn ghost small-btn" href={`/app/edit/${video.id}`}><Icon name="edit" size={16} />Edit</a>
            <button type="button" className="pd-close" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
          </div>
        </div>
      )}
    </dialog>
  );
}

function RenameDialog({ group, onClose, onSave }: { group: Group | null; onClose: () => void; onSave: (g: Group, title: string) => Promise<void> }) {
  const ref = useDialog(Boolean(group));
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (group) setTitle(group.title); }, [group]);
  return (
    <dialog ref={ref} className="small-dialog" onClose={onClose} aria-labelledby="rename-h">
      <form onSubmit={async (e) => { e.preventDefault(); if (!group) return; setSaving(true); await onSave(group, title); setSaving(false); }}>
        <h2 id="rename-h">Rename video</h2>
        <label htmlFor="rename-input">Name</label>
        <input id="rename-input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={saving || !title.trim()}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </dialog>
  );
}

function DeleteDialog({ group, onClose, onConfirm }: { group: Group | null; onClose: () => void; onConfirm: (g: Group) => Promise<void> }) {
  const ref = useDialog(Boolean(group));
  const [busy, setBusy] = useState(false);
  return (
    <dialog ref={ref} className="small-dialog" onClose={onClose} aria-labelledby="del-h">
      <h2 id="del-h">Delete “{group?.title}”?</h2>
      <p className="muted">This removes the video{group && group.items.length > 1 ? ` in all ${group.items.length} languages` : ""} from your library and deletes the files. Credits aren&apos;t refunded. This can&apos;t be undone.</p>
      <div className="dialog-actions">
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn danger-btn" disabled={busy} onClick={async () => { if (!group) return; setBusy(true); await onConfirm(group); setBusy(false); }}>{busy ? "Deleting…" : "Delete"}</button>
      </div>
    </dialog>
  );
}
