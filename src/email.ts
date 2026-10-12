/**
 * "Your video is ready" email, sent through Resend (resend.com) once every
 * language in a generation has finished. Plain, readable HTML with a text
 * version; no tracking pixels.
 */
export interface ReadyEmail {
  to: string;
  name?: string;
  title: string;
  siteUrl: string;
  videos: { language: string; ok: boolean }[];
}

const LANGUAGE_NAMES: Record<string, string> = {
  twi: "Twi", yo: "Yorùbá", pcm: "Pidgin", ha: "Hausa", en: "English", fr: "Français", sw: "Swahili", ig: "Igbo", ee: "Ewe", gaa: "Ga",
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderReadyEmail(m: ReadyEmail): { subject: string; html: string; text: string } {
  const ok = m.videos.filter((v) => v.ok);
  const failed = m.videos.filter((v) => !v.ok);
  const names = (vs: { language: string }[]) => vs.map((v) => LANGUAGE_NAMES[v.language] ?? v.language).join(", ");
  const first = (m.name ?? "").split(/\s+/)[0] || "there";
  const link = `${m.siteUrl.replace(/\/$/, "")}/app`;

  const subject = ok.length
    ? ok.length === 1 ? `Your video is ready: ${m.title}` : `Your ${ok.length} videos are ready: ${m.title}`
    : `We couldn't make your video: ${m.title}`;
  const lines = [
    `Hi ${first},`,
    ok.length ? `Good news: "${m.title}" is ready in ${names(ok)}.` : `Sorry, "${m.title}" couldn't be made this time.`,
    failed.length ? `${names(failed)} didn't work, so those credits were refunded automatically.` : "",
    `Watch and download it here: ${link}`,
    "Ayekoo!",
    "The Ayiko team",
  ].filter(Boolean);

  const html = `<!doctype html><html><body style="margin:0;background:#F5F6FB;font-family:Inter,Segoe UI,Arial,sans-serif;color:#12112A">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
  <p style="font-weight:800;font-size:20px;margin:0 0 24px">ayiko<span style="color:#2340D9">.ai</span></p>
  <div style="background:#fff;border:1px solid #DEDFEA;border-radius:16px;padding:28px">
    <h1 style="font-size:22px;line-height:1.25;margin:0 0 12px">${ok.length ? "Your video is ready" : "We couldn't make your video"}</h1>
    <p style="margin:0 0 12px;line-height:1.6">Hi ${esc(first)}, ${ok.length ? `<b>${esc(m.title)}</b> is ready in ${esc(names(ok))}.` : `<b>${esc(m.title)}</b> couldn't be made this time.`}</p>
    ${failed.length ? `<p style="margin:0 0 12px;line-height:1.6;color:#5B5A72">${esc(names(failed))} didn't work, so those credits were refunded automatically.</p>` : ""}
    <p style="margin:24px 0 8px"><a href="${esc(link)}" style="display:inline-block;background:#2340D9;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${ok.length ? "Watch and download" : "Try again"}</a></p>
  </div>
  <p style="font-size:12px;color:#5B5A72;margin:18px 4px;line-height:1.5">Ayekoo! You get this email because you made a video on Ayiko. Turn these emails off any time in the studio's account menu.</p>
</div></body></html>`;
  return { subject, html, text: lines.join("\n\n") };
}

type Fetch = typeof fetch;

export async function sendWithResend(apiKey: string, from: string, to: string, msg: { subject: string; html: string; text: string }, f: Fetch = fetch) {
  const res = await f("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: msg.subject, html: msg.html, text: msg.text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
