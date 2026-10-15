import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/api";
import { env } from "@/lib/env";
import { supabaseUser } from "@/lib/supabase";

export const runtime = "nodejs";

/** Update the display name. */
export async function PATCH(req: Request) {
  const auth = await requireUser();
  if ("res" in auth) return auth.res;
  const { db, user } = auth;
  const b = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (!name) return fail(400, "Enter your name.");
  const { error } = await db.auth.admin.updateUserById(user.id, { user_metadata: { ...(user.user_metadata ?? {}), full_name: name } });
  if (error) return fail(500, "We couldn't save that. Try again.");
  return NextResponse.json({ ok: true, name });
}

/**
 * Delete the account and everything in it. Blocked while a paid plan is
 * active (cancel it first, so Stripe stops charging) or a video is being made.
 */
export async function DELETE(req: Request) {
  const auth = await requireUser();
  if ("res" in auth) return auth.res;
  const { db, user } = auth;
  const b = (await req.json().catch(() => ({}))) as { confirm?: unknown };
  if (typeof b.confirm !== "string" || b.confirm.trim().toLowerCase() !== (user.email ?? "").toLowerCase()) return fail(400, "Type your email address to confirm.");

  const { data: billing } = await db.from("billing").select("status, cancel_at_period_end").eq("user_id", user.id).maybeSingle();
  if (billing && ["active", "trialing", "past_due"].includes(billing.status as string) && !billing.cancel_at_period_end) {
    return fail(409, "Cancel your monthly plan under Billing first, so you aren't charged again.");
  }
  const { count } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("status", ["queued", "running"]);
  if ((count ?? 0) > 0) return fail(409, "A video is still being made. Try again once it's finished.");

  // Remove the files first (same layout as src/storage.ts); the database rows go with the user.
  const bucket = db.storage.from(env.bucket);
  const { data: jobs } = await db.from("jobs").select("id").eq("user_id", user.id);
  const jobFiles = (jobs ?? []).flatMap((j) => ["voice.mp3", "clip.mp4", "ayiko.mp4"].map((f) => `users/${user.id}/jobs/${j.id}/${f}`));
  for (let i = 0; i < jobFiles.length; i += 900) await bucket.remove(jobFiles.slice(i, i + 900));
  for (;;) {
    const { data: files } = await bucket.list(`users/${user.id}/uploads`, { limit: 900 });
    const paths = (files ?? []).filter((f) => f.id).map((f) => `users/${user.id}/uploads/${f.name}`);
    if (!paths.length) break;
    const { error } = await bucket.remove(paths);
    if (error) break;
  }
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) { console.error("delete account failed", error); return fail(500, "We couldn't delete your account. Contact us and we'll do it for you."); }
  const sb = await supabaseUser();
  await sb.auth.signOut().catch(() => {});
  return NextResponse.json({ ok: true });
}
