import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Editor } from "@/components/app/Editor";
import { env, serverConfigured } from "@/lib/env";
import { currentUser, supabaseAdmin } from "@/lib/supabase";
import { balanceOf, isPaying } from "@/lib/studio";
import { cleanBrandKit } from "@/lib/brand";
import "../../../studio.css";

export const metadata: Metadata = { title: "Edit video · Ayiko.ai", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const db = supabaseAdmin();
  if (!serverConfigured() || !db) redirect("/app");
  const user = await currentUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=/app/edit/${id}`);

  const { data: job } = await db
    .from("jobs")
    .select("id, language, status, request, clip_key, voice_key, output_key, projects(title)")
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!job || job.status !== "succeeded") notFound();

  const req = (job.request ?? {}) as Record<string, unknown>;
  const bucket = db.storage.from(env.bucket);
  const sign = async (key?: unknown) => (typeof key === "string" && key ? (await bucket.createSignedUrl(key, 3600)).data?.signedUrl ?? null : null);
  const [clipUrl, photoUrl, outputUrl, balance, paying] = await Promise.all([
    sign(job.clip_key), sign(req.imageKey), sign(job.output_key), balanceOf(db, user.id), isPaying(db, user.id),
  ]);
  const project = (Array.isArray(job.projects) ? job.projects[0] : job.projects) as { title?: string } | null;

  return (
    <Editor
      job={{
        id: job.id as string,
        language: job.language as string,
        title: project?.title ?? "Your video",
        canEdit: Boolean(job.clip_key && job.voice_key),
        script: String(req.script ?? ""),
        headline: String(req.headline ?? ""),
        brandName: String(req.brandName ?? ""),
        cta: String(req.cta ?? ""),
        captionStyle: req.captionStyle === "box" ? "box" : "pop",
        design: (req.design ?? {}) as Record<string, unknown>,
      }}
      media={{ clipUrl, photoUrl, outputUrl }}
      balance={balance}
      watermark={!paying}
      brandColours={user.user_metadata?.brand_kit ? [cleanBrandKit(user.user_metadata.brand_kit).accent] : []}
    />
  );
}
