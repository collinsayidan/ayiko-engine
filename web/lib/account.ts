import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cleanBrandKit, type BrandKit } from "./brand";
import { billingEnabled } from "./stripe";
import { balanceOf, isPaying, studioStatus, type StudioStatus } from "./studio";

export interface Billing { enabled: boolean; plan: string; status: string; renewsAt: string | null; cancelAtPeriodEnd: boolean; hasCustomer: boolean }
export interface Account {
  name: string;
  email: string;
  avatar: string | null;
  selectedPlan: string | null;
  providers: string[];
  balance: number;
  paying: boolean;
  billing: Billing;
  status: StudioStatus;
  brand: BrandKit;
  emailUpdates: boolean;
  assist: boolean;
}

export const isSubscribed = (b: Pick<Billing, "status">) => ["active", "trialing", "past_due"].includes(b.status);

/** Everything the app shell and its pages need to know about the signed-in user. */
export async function loadAccount(db: SupabaseClient, user: User): Promise<Account> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const [balance, paying, status, billingRow, profile] = await Promise.all([
    balanceOf(db, user.id), isPaying(db, user.id), studioStatus(db),
    db.from("billing").select("stripe_customer_id, plan, status, renews_at, cancel_at_period_end").eq("user_id", user.id).maybeSingle().then((r) => r.data),
    db.from("profiles").select("email_updates").eq("id", user.id).maybeSingle().then((r) => r.data),
  ]);
  return {
    name: (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? "",
    email: user.email ?? "",
    avatar: (meta.avatar_url as string | undefined) ?? null,
    selectedPlan: (meta.selected_plan as string | undefined) ?? null,
    providers: ((user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider as string | undefined]).filter((p): p is string => Boolean(p)),
    balance,
    paying,
    status,
    brand: cleanBrandKit(meta.brand_kit),
    emailUpdates: profile?.email_updates !== false,
    assist: Boolean(process.env.ANTHROPIC_API_KEY),
    billing: {
      enabled: billingEnabled(),
      plan: (billingRow?.plan as string | undefined) ?? "free",
      status: (billingRow?.status as string | undefined) ?? "none",
      renewsAt: (billingRow?.renews_at as string | null | undefined) ?? null,
      cancelAtPeriodEnd: Boolean(billingRow?.cancel_at_period_end),
      hasCustomer: Boolean(billingRow?.stripe_customer_id),
    },
  };
}
