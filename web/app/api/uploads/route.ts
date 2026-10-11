import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/api";
import { env } from "@/lib/env";
import { LIMITS } from "@/lib/catalog";

export const runtime = "nodejs";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Gives the browser a one-time URL to upload a photo straight to private storage. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("res" in auth) return auth.res;
  const { db, user } = auth;

  const body = (await req.json().catch(() => ({}))) as { type?: string; size?: number };
  const type = String(body.type ?? "");
  const size = Number(body.size ?? 0);
  if (!LIMITS.photoTypes.includes(type)) return fail(400, "Use a JPG, PNG or WebP photo.");
  if (!size || size > LIMITS.photoBytes) return fail(400, "Photos can be up to 10 MB.");

  const path = `users/${user.id}/uploads/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${EXT[type]}`;
  const { data, error } = await db.storage.from(env.bucket).createSignedUploadUrl(path);
  if (error || !data) return fail(500, "We couldn't prepare the upload. Try again.");
  return NextResponse.json({ path, token: data.token });
}
