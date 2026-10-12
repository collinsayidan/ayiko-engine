import { NextResponse } from "next/server";
import { handleStripeEvent, type BillingStore } from "@/lib/billing-events";
import { supabaseAdmin } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Stripe → Ayiko. Add this URL in Stripe → Developers → Webhooks:
 *   https://<your site>/api/stripe/webhook
 * Events: checkout.session.completed, checkout.session.async_payment_succeeded,
 *         invoice.paid, customer.subscription.created/updated/deleted
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const db = supabaseAdmin();
  if (!secret || !db || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const raw = await req.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  const store: BillingStore = {
    async grant(userId, credits, reason, ref) {
      const { error } = await db.rpc("grant_credits", { p_user: userId, p_amount: credits, p_reason: reason, p_stripe_payment_id: ref });
      if (error) throw error;
    },
    async userForCustomer(customerId) {
      const { data } = await db.from("billing").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
      return (data?.user_id as string | undefined) ?? undefined;
    },
    async recordPayment(userId, ref, plan, amountPence) {
      const { error } = await db.from("payments").upsert(
        { user_id: userId, stripe_ref: ref, plan, amount_pence: amountPence },
        { onConflict: "stripe_ref", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    async save(userId, row) {
      const { error } = await db.from("billing").upsert({ user_id: userId, ...row, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
  };

  try {
    const result = await handleStripeEvent(event, store);
    console.log(JSON.stringify({ stripe: event.type, id: event.id, result }));
    return NextResponse.json({ received: true });
  } catch (err) {
    // 500 makes Stripe retry later; grants are idempotent so retries are safe.
    console.error("stripe webhook failed", event.type, event.id, err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
