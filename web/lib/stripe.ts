import "server-only";
import Stripe from "stripe";
import type { PaidPlan } from "./plans";

export const billingEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

let client: Stripe | undefined;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key, { appInfo: { name: "ayiko.ai" } });
  return client;
}

const priceCache = new Map<string, string>();

/**
 * The Stripe price for a plan. Created once (product + price with a lookup key)
 * the first time anyone buys it, then reused, so nothing needs setting up by hand.
 * To change a price later, change amountPence in plans.ts: a new lookup key is used.
 */
export async function priceFor(plan: PaidPlan): Promise<string> {
  const lookup = `ayiko_${plan.id}_gbp_${plan.amountPence}${plan.mode === "subscription" ? "_month" : ""}`;
  const cached = priceCache.get(lookup);
  if (cached) return cached;
  const s = stripe();
  const found = await s.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
  let id = found.data[0]?.id;
  if (!id) {
    const product = await s.products.create({ name: plan.name, metadata: { ayiko_plan: plan.id, credits: String(plan.credits) } });
    const price = await s.prices.create({
      product: product.id, currency: "gbp", unit_amount: plan.amountPence, lookup_key: lookup,
      ...(plan.mode === "subscription" ? { recurring: { interval: "month" as const } } : {}),
      metadata: { ayiko_plan: plan.id },
    });
    id = price.id;
  }
  priceCache.set(lookup, id);
  return id;
}
