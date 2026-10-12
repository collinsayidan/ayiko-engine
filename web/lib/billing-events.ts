import type Stripe from "stripe";
import { paidPlan } from "./plans";

/**
 * Turns Stripe webhook events into credits and plan status.
 * Pure logic (storage is passed in) so it can be tested without Stripe or a database.
 *
 *  - Starter pack (one-off): credits when the checkout is paid
 *  - Creator / Business (monthly): credits on every paid invoice, the first one included
 *  - Subscription changes keep the billing row (plan, status, renewal date) current
 *
 * Every grant carries the Stripe id as its reference, and the ledger accepts
 * each reference once, so Stripe resending an event never adds credits twice.
 */
export interface BillingRow {
  stripe_customer_id?: string;
  plan?: "free" | "starter" | "creator" | "business";
  status?: string;
  subscription_id?: string | null;
  renews_at?: string | null;
  cancel_at_period_end?: boolean;
}

export interface BillingStore {
  grant(userId: string, credits: number, reason: "purchase" | "subscription", ref: string): Promise<void>;
  userForCustomer(customerId: string): Promise<string | undefined>;
  save(userId: string, row: BillingRow): Promise<void>;
}

const idOf = (x: string | { id: string } | null | undefined) => (typeof x === "string" ? x : x?.id);

async function userFrom(store: BillingStore, metaUser: string | undefined | null, customer: string | { id: string } | null | undefined) {
  if (metaUser) return metaUser;
  const c = idOf(customer);
  return c ? store.userForCustomer(c) : undefined;
}

export async function handleStripeEvent(event: Stripe.Event, store: BillingStore): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = await userFrom(store, s.client_reference_id ?? s.metadata?.user_id, s.customer);
      const plan = paidPlan(s.metadata?.plan);
      if (!userId || !plan) return "ignored: not an Ayiko checkout";
      const customer = idOf(s.customer);
      if (customer) await store.save(userId, { stripe_customer_id: customer });
      if (s.mode === "payment") {
        if (s.payment_status !== "paid") return "waiting: payment not settled yet";
        await store.grant(userId, plan.credits, "purchase", `cs_${s.id}`);
        return `granted ${plan.credits} (${plan.id})`;
      }
      // Subscription credits arrive with invoice.paid.
      await store.save(userId, { plan: plan.id, subscription_id: idOf(s.subscription) ?? null });
      return `subscription started (${plan.id})`;
    }

    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice;
      const sub = inv.parent?.subscription_details;
      if (!sub) return "ignored: not a subscription invoice";
      const plan = paidPlan(sub.metadata?.plan);
      const userId = await userFrom(store, sub.metadata?.user_id, inv.customer);
      if (!userId || !plan || plan.mode !== "subscription") return "ignored: not an Ayiko subscription";
      await store.grant(userId, plan.credits, "subscription", `in_${inv.id}`);
      return `granted ${plan.credits} (${plan.id} renewal)`;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const plan = paidPlan(sub.metadata?.plan);
      const userId = await userFrom(store, sub.metadata?.user_id, sub.customer);
      if (!userId || !plan) return "ignored: not an Ayiko subscription";
      const ended = event.type === "customer.subscription.deleted" || ["canceled", "incomplete_expired"].includes(sub.status);
      const periodEnd = sub.items?.data?.[0]?.current_period_end;
      await store.save(userId, {
        stripe_customer_id: idOf(sub.customer),
        plan: ended ? "free" : (plan.id as BillingRow["plan"]),
        status: sub.status,
        subscription_id: ended ? null : sub.id,
        renews_at: !ended && periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      });
      return `plan ${ended ? "ended" : sub.status} (${plan.id})`;
    }

    default:
      return `ignored: ${event.type}`;
  }
}
