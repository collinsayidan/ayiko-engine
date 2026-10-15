import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/api";
import { paidPlan } from "@/lib/plans";
import { billingEnabled, priceFor, stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/** Start a Stripe Checkout for a plan and return its URL. */
export async function POST(req: Request) {
  if (!billingEnabled()) return fail(503, "Card payments aren't switched on yet.");
  const auth = await requireUser();
  if ("res" in auth) return auth.res;
  const { db, user } = auth;

  const body = (await req.json().catch(() => ({}))) as { plan?: string };
  const plan = paidPlan(body.plan);
  if (!plan) return fail(400, "Pick a plan.");

  const { data: billing } = await db.from("billing").select("stripe_customer_id, plan, status").eq("user_id", user.id).maybeSingle();
  if (plan.mode === "subscription" && billing && ["active", "trialing", "past_due"].includes(billing.status as string)) {
    return fail(409, "You already have a monthly plan. Use Manage billing to change or cancel it.", { manage: true });
  }

  try {
    const s = stripe();
    let customer = billing?.stripe_customer_id as string | undefined;
    if (!customer) {
      const c = await s.customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } });
      customer = c.id;
      await db.from("billing").upsert({ user_id: user.id, stripe_customer_id: customer, updated_at: new Date().toISOString() });
    }
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const meta = { user_id: user.id, plan: plan.id };
    const session = await s.checkout.sessions.create({
      mode: plan.mode,
      customer,
      client_reference_id: user.id,
      line_items: [{ price: await priceFor(plan), quantity: 1 }],
      metadata: meta,
      ...(plan.mode === "subscription" ? { subscription_data: { metadata: meta } } : { payment_intent_data: { metadata: meta } }),
      allow_promotion_codes: true,
      success_url: `${origin}/app/billing?checkout=success&plan_paid=${plan.id}`,
      cancel_url: `${origin}/app/billing?checkout=cancelled`,
    });
    if (!session.url) throw new Error("no checkout url");
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("checkout failed", err);
    return fail(502, "We couldn't open the payment page. Try again in a moment.");
  }
}
