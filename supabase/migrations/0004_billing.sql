-- Ayiko.ai billing: links each user to their Stripe customer and current plan.
-- Written only by the server (Stripe webhook); users can read their own row.
-- Credits themselves are granted in credit_ledger via grant_credits(),
-- keyed on the Stripe payment/invoice id so webhook retries never double-credit.

create table if not exists public.billing (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id  text unique,
  plan                text not null default 'free' check (plan in ('free', 'starter', 'creator', 'business')),
  status              text not null default 'none',   -- Stripe subscription status, or 'none'
  subscription_id     text,
  renews_at           timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at          timestamptz not null default now()
);

alter table public.billing enable row level security;
create policy "own billing" on public.billing for select using (user_id = auth.uid());
