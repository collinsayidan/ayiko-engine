import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppStudio } from "@/components/app/AppStudio";
import { serverConfigured } from "@/lib/env";
import { currentUser, supabaseAdmin } from "@/lib/supabase";
import { balanceOf, listVideos, studioStatus } from "@/lib/studio";
import "../studio.css";

export const metadata: Metadata = { title: "Studio · Ayiko.ai", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AppPage({ searchParams }: { searchParams: Promise<{ template?: string; lang?: string }> }) {
  const db = supabaseAdmin();
  if (!serverConfigured() || !db) {
    return (
      <main className="auth">
        <div className="auth-card">
          <h1>Almost ready</h1>
          <p className="muted">The studio needs its Supabase keys. Add them in Vercel → Settings → Environment Variables, then redeploy.</p>
        </div>
      </main>
    );
  }
  const user = await currentUser();
  if (!user) redirect("/login?next=/app");

  const sp = await searchParams;
  const [videos, balance, status] = await Promise.all([listVideos(db, user.id), balanceOf(db, user.id), studioStatus(db)]);
  const name = (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined) ?? user.email ?? "";

  return (
    <AppStudio
      initial={{ videos, balance, status }}
      user={{ name, email: user.email ?? "", avatar: (user.user_metadata?.avatar_url as string | undefined) ?? null }}
      start={{ template: sp.template, lang: sp.lang }}
    />
  );
}
