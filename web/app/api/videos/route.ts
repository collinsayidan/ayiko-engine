import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { balanceOf, listVideos, studioStatus } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The user's videos, balance and studio status. The studio polls this while videos are being made. */
export async function GET() {
  const auth = await requireUser();
  if ("res" in auth) return auth.res;
  const { db, user } = auth;
  const [videos, balance, status] = await Promise.all([listVideos(db, user.id), balanceOf(db, user.id), studioStatus(db)]);
  return NextResponse.json({ videos, balance, status }, { headers: { "cache-control": "no-store" } });
}
