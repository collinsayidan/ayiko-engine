import type { Metadata } from "next";
import { BillingView } from "@/components/app/BillingView";
import { creditHistory, spentSince } from "@/lib/studio";
import { currentUser, supabaseAdmin } from "@/lib/supabase";

export const metadata: Metadata = { title: "Billing · Ayiko.ai", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const db = supabaseAdmin();
  const user = await currentUser();
  if (!db || !user) return null;
  // Usage is counted from the start of the current billing month (or calendar month without a plan).
  const { data: billing } = await db.from("billing").select("renews_at").eq("user_id", user.id).maybeSingle();
  const renews = billing?.renews_at ? new Date(billing.renews_at as string) : null;
  const since = renews && renews > new Date()
    ? new Date(renews.getFullYear(), renews.getMonth() - 1, renews.getDate())
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [history, spent] = await Promise.all([creditHistory(db, user.id), spentSince(db, user.id, since.toISOString())]);
  return <BillingView history={history} spent={{ credits: spent, since: since.toISOString() }} />;
}
