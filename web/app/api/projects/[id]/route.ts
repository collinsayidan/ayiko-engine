import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fail, requireUser } from "@/lib/api";
import { env } from "@/lib/env";

export const runtime = "nodejs";

async function ownProject(db: SupabaseClient, userId: string, id: string) {
  const { data } = await db.from("projects").select("id, jobs(id, status, output_key)").eq("id", id).eq("user_id", userId).maybeSingle();
  return data as { id: string; jobs: { id: string; status: string; output_key: string | null }[] } | null;
}

/** Rename a video (all its languages share one project). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("res" in auth) return auth.res;
  const { db, user } = auth;
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { title?: unknown };
  const title = typeof b.title === "string" ? b.title.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (!title) return fail(400, "Give the video a name.");
  if (!(await ownProject(db, user.id, id))) return fail(404, "That video isn't available.");
  const { error } = await db.from("projects").update({ title }).eq("id", id).eq("user_id", user.id);
  if (error) return fail(500, "We couldn't rename it. Try again.");
  return NextResponse.json({ ok: true, title });
}

/**
 * Delete a finished video with all its languages. Videos still being made
 * can't be deleted, so a running job never loses its row (and its refund).
 * The credit history keeps its rows; they just no longer link to a video.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("res" in auth) return auth.res;
  const { db, user } = auth;
  const { id } = await params;
  const project = await ownProject(db, user.id, id);
  if (!project) return fail(404, "That video isn't available.");
  if (project.jobs.some((j) => j.status === "queued" || j.status === "running")) return fail(409, "This video is still being made. Delete it once it's finished.");
  // Only the finished files: the voice and AI clip can be shared with edited versions.
  const outputs = project.jobs.map((j) => j.output_key).filter((k): k is string => Boolean(k));
  if (outputs.length) await db.storage.from(env.bucket).remove(outputs);
  const { error } = await db.from("projects").delete().eq("id", id).eq("user_id", user.id);
  if (error) { console.error("delete project failed", error); return fail(500, "We couldn't delete it. Try again."); }
  return NextResponse.json({ ok: true });
}
