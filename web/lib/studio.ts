import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

export interface StudioStatus {
  online: boolean;
  languages: string[];
}

/** Which languages the render workers can voice, and whether any checked in in the last 2 minutes. */
export async function studioStatus(db: SupabaseClient): Promise<StudioStatus> {
  const { data } = await db.from("worker_status").select("languages, seen_at");
  const cutoff = Date.now() - 2 * 60_000;
  const live = (data ?? []).filter((w) => new Date(w.seen_at as string).getTime() > cutoff);
  const recent = (data ?? []).filter((w) => new Date(w.seen_at as string).getTime() > Date.now() - 24 * 3600_000);
  // Offer languages from workers seen today, so a quick restart doesn't hide them.
  const languages = [...new Set(recent.flatMap((w) => (w.languages as string[]) ?? []))];
  return { online: live.length > 0, languages };
}

export async function balanceOf(db: SupabaseClient, userId: string): Promise<number> {
  const { data } = await db.from("credit_balances").select("balance").eq("user_id", userId).maybeSingle();
  return (data?.balance as number | undefined) ?? 0;
}

/** Free accounts get the small ayiko.ai mark; anyone who has bought credits doesn't. */
export async function isPaying(db: SupabaseClient, userId: string): Promise<boolean> {
  const { count } = await db
    .from("credit_ledger").select("id", { count: "exact", head: true })
    .eq("user_id", userId).in("reason", ["purchase", "subscription"]);
  return (count ?? 0) > 0;
}

export interface VideoItem {
  id: string;
  batchId: string | null;
  projectId: string | null;
  language: string;
  status: "queued" | "running" | "succeeded" | "failed";
  step: string | null;
  error: string | null;
  credits: number;
  createdAt: string;
  title: string;
  template: string;
  waitingForFirst: boolean;
  photoUrl: string | null;
  videoUrl: string | null;
  downloadUrl: string | null;
  /** What it was made from, so "Duplicate" can start a new video with the same settings. */
  source: { imageKey: string | null; script: string; headline: string; brandName: string; cta: string; gender: string; durationS: number };
}

/** The user's recent videos with short-lived signed URLs (the bucket is private). */
export async function listVideos(db: SupabaseClient, userId: string, limit = 40): Promise<VideoItem[]> {
  const { data, error } = await db
    .from("jobs")
    .select("id, batch_id, project_id, language, status, current_step, error, credits_charged, created_at, output_key, depends_on, request, projects(title, template)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = data ?? [];

  const outputs = rows.map((r) => r.output_key as string | null).filter((k): k is string => Boolean(k));
  const photos = [...new Set(rows.map((r) => (r.request as { imageKey?: string })?.imageKey).filter((k): k is string => Boolean(k)))];
  const bucket = db.storage.from(env.bucket);
  const sign = async (paths: string[], download?: boolean) => {
    if (!paths.length) return new Map<string, string>();
    const { data: signed } = await bucket.createSignedUrls(paths, 3600, download ? { download: true } : undefined);
    return new Map((signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl]));
  };
  const [play, dl, pics] = await Promise.all([sign(outputs), sign(outputs, true), sign(photos)]);
  const statusOf = new Map(rows.map((r) => [r.id as string, r.status as string]));

  return rows.map((r) => {
    const project = (Array.isArray(r.projects) ? r.projects[0] : r.projects) as { title?: string; template?: string } | null;
    const req = (r.request ?? {}) as { imageKey?: string; script?: string; headline?: string; brandName?: string; cta?: string; gender?: string; videoDurationS?: number };
    const out = r.output_key as string | null;
    return {
      id: r.id as string,
      batchId: (r.batch_id as string | null) ?? null,
      projectId: (r.project_id as string | null) ?? null,
      language: r.language as string,
      status: r.status as VideoItem["status"],
      step: (r.current_step as string | null) ?? null,
      error: (r.error as string | null) ?? null,
      credits: r.credits_charged as number,
      createdAt: r.created_at as string,
      title: project?.title ?? "Untitled video",
      template: project?.template ?? "",
      waitingForFirst: r.status === "queued" && Boolean(r.depends_on) && statusOf.get(r.depends_on as string) !== "succeeded",
      photoUrl: req.imageKey ? pics.get(req.imageKey) ?? null : null,
      videoUrl: out ? play.get(out) ?? null : null,
      downloadUrl: out ? dl.get(out) ?? null : null,
      source: {
        imageKey: req.imageKey ?? null, script: req.script ?? "", headline: req.headline ?? "", brandName: req.brandName ?? "",
        cta: req.cta ?? "", gender: req.gender ?? "female", durationS: req.videoDurationS === 10 ? 10 : 5,
      },
    };
  });
}

export interface LedgerRow { id: number; delta: number; reason: string; createdAt: string; title: string | null; language: string | null }

/** The user's recent credit movements, newest first, with the video each one was for. */
export async function creditHistory(db: SupabaseClient, userId: string, limit = 60): Promise<LedgerRow[]> {
  const { data } = await db
    .from("credit_ledger")
    .select("id, delta, reason, created_at, jobs(language, projects(title))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => {
    const job = (Array.isArray(r.jobs) ? r.jobs[0] : r.jobs) as { language?: string; projects?: { title?: string } | { title?: string }[] } | null;
    const project = job ? (Array.isArray(job.projects) ? job.projects[0] : job.projects) : null;
    return { id: r.id as number, delta: r.delta as number, reason: r.reason as string, createdAt: r.created_at as string, title: project?.title ?? null, language: job?.language ?? null };
  });
}

/** Credits spent on videos since a date (net of refunds). */
export async function spentSince(db: SupabaseClient, userId: string, since: string): Promise<number> {
  const { data } = await db.from("credit_ledger").select("delta").eq("user_id", userId).in("reason", ["generation", "refund"]).gte("created_at", since);
  return -(data ?? []).reduce((a, r) => a + (r.delta as number), 0);
}
