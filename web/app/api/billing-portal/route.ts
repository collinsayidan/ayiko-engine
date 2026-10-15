import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/api";
import { billingEnabled, stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/** Stripe's hosted page to update the card, see invoices or cancel. */
export async function POST(req: Request) {
  if (!billingEnabled()) return fail(503, "Card payments aren't switched on yet.");
  const auth = await requireUser();
  if ("res" in auth) return auth.res;
  const { db, user } = auth;
  const { data } = await db.from("billing").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (!data?.stripe_customer_id) return fail(404, "There's no billing account yet. Buy credits first.");
  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const portal = await stripe().billingPortal.sessions.create({ customer: data.stripe_customer_id as string, return_url: `${origin}/app/billing` });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    console.error("billing portal failed", err);
    return fail(502, "We couldn't open billing. Try again in a moment.");
  }
}
