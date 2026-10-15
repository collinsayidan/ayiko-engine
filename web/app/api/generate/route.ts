import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/api";
import { env } from "@/lib/env";
import { LIMITS, languageByCode, templateById, type Gender } from "@/lib/catalog";
import { cleanDesign } from "@/lib/design";
import { quoteGeneration } from "@/lib/pricing";
import { balanceOf, isPaying, studioStatus } from "@/lib/studio";

export const runtime = "nodejs";

const text = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

interface Body {
  imageKey?: string;
  template?: string;
  gender?: Gender;
  videoDurationS?: number;
  headline?: string;
  brandName?: string;
  cta?: string;
  captionStyle?: string;
  design?: unknown;
  languages?: { code?: string; script?: string }[];
}

/** Create a video (one job per language) and charge for it. The render worker picks the jobs up. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("res" in auth) return auth.res;
  const { db, user } = auth;
  const b = (await req.json().catch(() => ({}))) as Body;

  const tpl = templateById(String(b.template ?? ""));
  if (!tpl) return fail(400, "Pick a template.");

  const imageKey = String(b.imageKey ?? "");
  if (!imageKey.startsWith(`users/${user.id}/uploads/`) || imageKey.includes("..")) return fail(400, "Add a photo first.");
  const dir = imageKey.slice(0, imageKey.lastIndexOf("/"));
  const file = imageKey.slice(imageKey.lastIndexOf("/") + 1);
  const { data: found } = await db.storage.from(env.bucket).list(dir, { search: file, limit: 1 });
  if (!found?.some((f) => f.name === file)) return fail(400, "That photo didn't finish uploading. Add it again.");

  const status = await studioStatus(db);
  const langs = (Array.isArray(b.languages) ? b.languages : []).slice(0, LIMITS.languages + 1);
  if (!langs.length) return fail(400, "Pick at least one language.");
  if (langs.length > LIMITS.languages) return fail(400, `You can make up to ${LIMITS.languages} languages at once.`);
  const seen = new Set<string>();
  const items: { code: string; script: string }[] = [];
  for (const l of langs) {
    const code = String(l.code ?? "");
    const lang = languageByCode(code);
    if (!lang || seen.has(code)) return fail(400, "Each language can only be picked once.");
    if (!status.languages.includes(code)) return fail(400, `${lang.name} voices aren't available yet. Pick another language.`);
    const script = text(l.script, LIMITS.scriptChars + 1);
    if (!script) return fail(400, `Write the ${lang.name} script for the voiceover.`, { field: `script-${code}` });
    if (script.length > LIMITS.scriptChars) return fail(400, `Keep the ${lang.name} script under ${LIMITS.scriptChars} characters.`, { field: `script-${code}` });
    seen.add(code);
    items.push({ code, script });
  }

  const videoDurationS: 5 | 10 = b.videoDurationS === 10 ? 10 : 5;
  const gender: Gender = b.gender === "male" ? "male" : "female";
  const quote = quoteGeneration(items.map((i) => i.script), videoDurationS);
  const balance = await balanceOf(db, user.id);
  if (balance < quote.total) {
    return fail(402, `This needs ${quote.total} credits and you have ${balance}.`, { needed: quote.total, balance });
  }

  const watermark = !(await isPaying(db, user.id));
  const brandName = text(b.brandName, LIMITS.brand);
  const shared = {
    imageKey, gender, videoDurationS, aspect: "9:16", captionStyle: b.captionStyle === "box" ? "box" : "pop", design: cleanDesign(b.design), watermark, template: tpl.id,
    motionPrompt: tpl.motionPrompt,
    headline: text(b.headline, LIMITS.headline),
    brandName,
    cta: text(b.cta, LIMITS.cta),
  };
  const jobs = items.map((it, i) => ({ language: it.code, credits: quote.perLanguage[i], request: { ...shared, script: it.script } }));

  const { data, error } = await db.rpc("create_generation", {
    p_user: user.id, p_template: tpl.id, p_title: brandName || tpl.name, p_jobs: jobs,
  });
  if (error) {
    if (error.message.includes("insufficient_credits")) return fail(402, `This needs ${quote.total} credits. Your balance is lower than that.`);
    if (error.message.includes("too_many_active_jobs")) return fail(429, "You have lots of videos in progress. Wait for some to finish, then try again.");
    console.error("create_generation failed", error);
    return fail(500, "We couldn't start your video. You weren't charged. Try again.");
  }
  const rows = (data ?? []) as { job_id: string; balance_after: number }[];
  return NextResponse.json({
    jobIds: rows.map((r) => r.job_id),
    charged: quote.total,
    balance: rows.at(-1)?.balance_after ?? balance - quote.total,
    studioOnline: status.online,
  });
}
