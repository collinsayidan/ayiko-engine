import type { Metadata } from "next";
import { CreateView, type Seed } from "@/components/app/CreateView";
import { env } from "@/lib/env";
import { currentUser, supabaseAdmin } from "@/lib/supabase";

export const metadata: Metadata = { title: "Create · Ayiko.ai", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Settings from an earlier video, for "Duplicate": same photo, scripts and text in every language it was made in. */
async function seedFrom(jobId: string): Promise<Seed | null> {
  const db = supabaseAdmin();
  const user = await currentUser();
  if (!db || !user || !/^[0-9a-f-]{36}$/i.test(jobId)) return null;
  const { data: job } = await db.from("jobs").select("id, batch_id, request, projects(title, template)").eq("id", jobId).eq("user_id", user.id).maybeSingle();
  if (!job) return null;
  const { data: siblings } = job.batch_id
    ? await db.from("jobs").select("language, request, created_at").eq("batch_id", job.batch_id).eq("user_id", user.id).order("created_at")
    : { data: [{ language: null, request: job.request }] };
  const req = (job.request ?? {}) as Record<string, unknown>;
  const project = (Array.isArray(job.projects) ? job.projects[0] : job.projects) as { title?: string; template?: string } | null;
  const scripts: Record<string, string> = {};
  for (const s of siblings ?? []) {
    const r = (s.request ?? {}) as Record<string, unknown>;
    if (s.language && typeof r.script === "string") scripts[s.language as string] = r.script;
  }
  const key = typeof req.imageKey === "string" && req.imageKey.startsWith(`users/${user.id}/uploads/`) ? req.imageKey : null;
  const url = key ? (await db.storage.from(env.bucket).createSignedUrl(key, 3600)).data?.signedUrl ?? null : null;
  return {
    template: project?.template ?? (req.template as string | undefined),
    photo: key ? { key, url } : undefined,
    scripts,
    headline: typeof req.headline === "string" ? req.headline : undefined,
    brandName: typeof req.brandName === "string" ? req.brandName : undefined,
    cta: typeof req.cta === "string" ? req.cta : undefined,
    gender: req.gender === "male" ? "male" : "female",
    durationS: req.videoDurationS === 10 ? 10 : 5,
    title: project?.title?.replace(/ \(edit\)$/, ""),
  };
}

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ template?: string; lang?: string; from?: string }> }) {
  const sp = await searchParams;
  const seed = (sp.from && (await seedFrom(sp.from))) || { template: sp.template, lang: sp.lang };
  return <CreateView seed={seed} />;
}
