/**
 * What each paid plan costs and grants. Prices are in pence (GBP).
 * Checkout builds Stripe prices from this table, so no products need
 * creating in the Stripe dashboard. Keep in step with PLANS in content.ts.
 */
export interface PaidPlan {
  id: "starter" | "creator" | "business";
  name: string;
  amountPence: number;
  credits: number;
  mode: "payment" | "subscription";
}

export const PAID_PLANS: Record<PaidPlan["id"], PaidPlan> = {
  starter: { id: "starter", name: "Ayiko Starter pack", amountPence: 500, credits: 60, mode: "payment" },
  creator: { id: "creator", name: "Ayiko Creator", amountPence: 1500, credits: 220, mode: "subscription" },
  business: { id: "business", name: "Ayiko Business", amountPence: 3900, credits: 650, mode: "subscription" },
};

export const paidPlan = (id: unknown): PaidPlan | undefined =>
  typeof id === "string" && id in PAID_PLANS ? PAID_PLANS[id as PaidPlan["id"]] : undefined;
