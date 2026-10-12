import { describe, expect, it } from "vitest";
import { handleStripeEvent, type BillingRow, type BillingStore } from "../web/lib/billing-events";
import { PAID_PLANS } from "../web/lib/plans";
import { PLANS } from "../web/lib/content";

/** Mirrors grant_credits: each Stripe reference is credited at most once. */
class MemoryBilling implements BillingStore {
  grants = new Map<string, { userId: string; credits: number; reason: string }>();
  rows = new Map<string, BillingRow>();
  async grant(userId: string, credits: number, reason: "purchase" | "subscription", ref: string) {
    if (!this.grants.has(ref)) this.grants.set(ref, { userId, credits, reason });
  }
  async userForCustomer(c: string) {
    return [...this.rows.entries()].find(([, r]) => r.stripe_customer_id === c)?.[0];
  }
  payments = new Map<string, number>();
  async recordPayment(_u: string, ref: string, _p: string, pence: number) { if (!this.payments.has(ref)) this.payments.set(ref, pence); }
  async save(userId: string, row: BillingRow) {
    this.rows.set(userId, { ...this.rows.get(userId), ...row });
  }
  total(userId: string) {
    return [...this.grants.values()].filter((g) => g.userId === userId).reduce((n, g) => n + g.credits, 0);
  }
}

const ev = (type: string, object: Record<string, unknown>) => ({ id: `evt_${Math.random()}`, type, data: { object } }) as never;

describe("Stripe webhook handling", () => {
  it("credits a paid Starter pack once, even if Stripe resends the event", async () => {
    const store = new MemoryBilling();
    const e = ev("checkout.session.completed", { id: "cs_1", mode: "payment", payment_status: "paid", client_reference_id: "u1", customer: "cus_1", metadata: { user_id: "u1", plan: "starter" } });
    await handleStripeEvent(e, store);
    await handleStripeEvent(e, store);
    expect(store.total("u1")).toBe(60);
    expect(store.rows.get("u1")?.stripe_customer_id).toBe("cus_1");
    expect([...store.payments.values()]).toEqual([500]);
  });

  it("waits for delayed payment methods before crediting", async () => {
    const store = new MemoryBilling();
    const base = { id: "cs_2", mode: "payment", client_reference_id: "u1", customer: "cus_1", metadata: { user_id: "u1", plan: "starter" } };
    await handleStripeEvent(ev("checkout.session.completed", { ...base, payment_status: "unpaid" }), store);
    expect(store.total("u1")).toBe(0);
    await handleStripeEvent(ev("checkout.session.async_payment_succeeded", { ...base, payment_status: "paid" }), store);
    expect(store.total("u1")).toBe(60);
  });

  it("credits a subscription on every paid invoice, and tracks the plan", async () => {
    const store = new MemoryBilling();
    await handleStripeEvent(ev("checkout.session.completed", { id: "cs_3", mode: "subscription", payment_status: "paid", client_reference_id: "u2", customer: "cus_2", subscription: "sub_1", metadata: { user_id: "u2", plan: "creator" } }), store);
    expect(store.total("u2")).toBe(0); // credits come with the invoice
    const invoice = (id: string) => ev("invoice.paid", { id, customer: "cus_2", amount_paid: 1500, parent: { subscription_details: { subscription: "sub_1", metadata: { user_id: "u2", plan: "creator" } } } });
    await handleStripeEvent(invoice("in_1"), store);
    await handleStripeEvent(invoice("in_1"), store); // retry
    await handleStripeEvent(invoice("in_2"), store); // next month
    expect(store.total("u2")).toBe(440);
    expect([...store.payments.values()].reduce((a, b) => a + b, 0)).toBe(3000);

    await handleStripeEvent(ev("customer.subscription.updated", { id: "sub_1", status: "active", customer: "cus_2", cancel_at_period_end: true, metadata: { user_id: "u2", plan: "creator" }, items: { data: [{ current_period_end: 1800000000 }] } }), store);
    expect(store.rows.get("u2")).toMatchObject({ plan: "creator", status: "active", cancel_at_period_end: true });
    await handleStripeEvent(ev("customer.subscription.deleted", { id: "sub_1", status: "canceled", customer: "cus_2", metadata: { user_id: "u2", plan: "creator" }, items: { data: [] } }), store);
    expect(store.rows.get("u2")).toMatchObject({ plan: "free", subscription_id: null });
  });

  it("finds the user by customer id when metadata is missing, and ignores other events", async () => {
    const store = new MemoryBilling();
    await store.save("u3", { stripe_customer_id: "cus_3" });
    await handleStripeEvent(ev("invoice.paid", { id: "in_9", customer: "cus_3", parent: { subscription_details: { metadata: { plan: "business" } } } }), store);
    expect(store.total("u3")).toBe(650);
    expect(await handleStripeEvent(ev("invoice.paid", { id: "in_x", customer: "cus_3", parent: null }), store)).toMatch(/ignored/);
    expect(await handleStripeEvent(ev("charge.refunded", {}), store)).toMatch(/ignored/);
    expect(await handleStripeEvent(ev("checkout.session.completed", { id: "cs_x", mode: "payment", payment_status: "paid", metadata: { plan: "hacker" } }), store)).toMatch(/ignored/);
  });

  it("pricing page and checkout agree on prices and credits", () => {
    for (const p of Object.values(PAID_PLANS)) {
      const shown = PLANS.find((x) => x.id === p.id)!;
      expect(shown.price).toBe(`£${p.amountPence / 100}`);
      expect(shown.credits.startsWith(String(p.credits))).toBe(true);
    }
  });
});
