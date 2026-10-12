import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminView, type Stats } from "@/components/admin/AdminView";
import { currentUser, supabaseAdmin } from "@/lib/supabase";
import "../studio.css";

export const metadata: Metadata = { title: "Admin · Ayiko.ai", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Owner-only dashboard. Access: emails listed in the ADMIN_EMAILS environment variable. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin");
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!user.email || !admins.includes(user.email.toLowerCase())) notFound();
  const db = supabaseAdmin();
  if (!db) notFound();

  const days = [7, 30, 90].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 30;
  const { data, error } = await db.rpc("admin_stats", { p_days: days });
  if (error || !data) return <main className="auth"><div className="auth-card"><h1>Stats unavailable</h1><p className="muted">Run supabase/migrations/0005_editor_email_admin.sql, then reload.</p></div></main>;
  return <AdminView stats={data as Stats} days={days} />;
}
