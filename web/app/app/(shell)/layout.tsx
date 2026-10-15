import { redirect } from "next/navigation";
import { Shell } from "@/components/app/Shell";
import { loadAccount } from "@/lib/account";
import { serverConfigured } from "@/lib/env";
import { currentUser, supabaseAdmin } from "@/lib/supabase";
import "../../studio.css";

export const dynamic = "force-dynamic";

/** The signed-in app: sidebar, top bar and account state shared by every page. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
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
  return <Shell initial={await loadAccount(db, user)}>{children}</Shell>;
}
