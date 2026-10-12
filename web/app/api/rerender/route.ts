import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/api";
import { LIMITS } from "@/lib/catalog";
import { cleanDesign } from "@/lib/design";
import { PRICES } from "@/lib/pricing";
import { balanceOf, isPaying } from "@/lib/studio";

export const runtime = "nodejs";

const text = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/**
 * Editing canvas: render a new version of a finished video with a new look.
 * Reuses the original voice and AI clip, so it only costs the render (1 credit).
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("res" in auth) return auth.res;
  const { db, user } = auth;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const { data: job } = await db
    .from("jobs")
    .select("id, user_id, language, status, request, clip_key, voice_key, projects(title, template)")
    .eq("id", String(b.jobId ?? ""))
    .eq("user_id", user.id)
    .maybeSingle();
  if (!job || job.status !== "succeeded") return fail(404, "That video isn't available to edit.");
  if (!job.clip_key || !job.voice_key) return fail(409, "This video was made before editing was possible. Make a new one to edit it.");

  const old = (job.request ?? {}) as Record<string, unknown>;
  const script = text(b.script, LIMITS.scriptChars) || String(old.script ?? "");
  const credits = PRICES.render;
  const balance = await balanceOf(db, user.id);
  if (balance < credits) return fail(402, `A new version needs ${credits} credit and you have ${balance}.`);

  const project = (Array.isArray(job.projects) ? job.projects[0] : job.projects) as { title?: string; template?: string } | null;
  const request = {
    imageKey: old.imageKey, gender: old.gender, videoDurationS: old.videoDurationS, aspect: old.aspect ?? "9:16",
    motionPrompt: old.motionPrompt, template: old.template,
    script,
    captionStyle: b.captionStyle === "box" ? "box" : "pop",
    headline: text(b.headline, LIMITS.headline),
    brandName: text(b.brandName, LIMITS.brand),
    cta: text(b.cta, LIMITS.cta),
    design: cleanDesign(b.design),
    watermark: !(await isPaying(db, user.id)),
    editOf: job.id,
  };

  const { data, error } = await db.rpc("create_generation", {
    p_user: user.id,
    p_template: project?.template ?? String(old.template ?? "edit"),
    p_title: `${project?.title ?? "Video"} (edit)`.slice(0, 120),
    p_jobs: [{ language: job.language, credits, clip_key: job.clip_key, voice_key: job.voice_key, request }],
  });
  if (error) {
    if (error.message.includes("too_many_active_jobs")) return fail(429, "You have lots of videos in progress. Wait for some to finish, then try again.");
    if (error.message.includes("insufficient_credits")) return fail(402, "You don't have enough credits for a new version.");
    console.error("rerender failed", error);
    return fail(500, "We couldn't start the new version. You weren't charged.");
  }
  const rows = (data ?? []) as { job_id: string; balance_after: number }[];
  return NextResponse.json({ jobId: rows[0]?.job_id, charged: credits, balance: rows[0]?.balance_after });
}
