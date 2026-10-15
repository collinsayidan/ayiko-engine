import type { Metadata } from "next";
import { Library } from "@/components/app/Library";
import { listVideos } from "@/lib/studio";
import { currentUser, supabaseAdmin } from "@/lib/supabase";

export const metadata: Metadata = { title: "My videos · Ayiko.ai", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function VideosPage({ searchParams }: { searchParams: Promise<{ started?: string; charged?: string; online?: string }> }) {
  const db = supabaseAdmin();
  const user = await currentUser();
  if (!db || !user) return null;
  const sp = await searchParams;
  const started = sp.started ? { count: Number(sp.started) || 1, charged: Number(sp.charged) || 0, online: sp.online !== "0" } : undefined;
  return <Library initial={await listVideos(db, user.id)} started={started} />;
}
