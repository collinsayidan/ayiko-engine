import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/api";
import { cleanBrandKit } from "@/lib/brand";

export const runtime = "nodejs";

/** Save the brand kit on the account (auth user_metadata, so no table is needed). */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("res" in auth) return auth.res;
  const { db, user } = auth;
  const brand = cleanBrandKit(await req.json().catch(() => ({})));
  const { error } = await db.auth.admin.updateUserById(user.id, { user_metadata: { ...(user.user_metadata ?? {}), brand_kit: brand } });
  if (error) { console.error("brand kit save failed", error); return fail(500, "We couldn't save your brand kit. Try again."); }
  return NextResponse.json({ ok: true, brand });
}
