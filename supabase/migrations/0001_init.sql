-- Ayiko.ai core schema
-- Run with: supabase db push   (or paste into the Supabase SQL editor)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  country       text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Projects: one video being made
-- ---------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  template    text not null default 'blank',
  title       text not null default 'Untitled video',
  created_at  timestamptz not null default now()
);
create index on public.projects (user_id, created_at desc);

-- ---------------------------------------------------------------
-- Assets: every uploaded or generated file
-- ---------------------------------------------------------------
create table public.assets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  project_id   uuid references public.projects(id) on delete cascade,
  kind         text not null check (kind in ('upload','image','audio','video','captions','render')),
  storage_key  text not null,
  mime         text,
  duration_s   numeric(8,2),
  created_at   timestamptz not null default now()
);
create index on public.assets (project_id);

-- ---------------------------------------------------------------
-- Jobs: one pipeline run (e.g. a captioned short). Regenerate = new job.
-- ---------------------------------------------------------------
create table public.jobs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  project_id       uuid references public.projects(id) on delete cascade,
  kind             text not null default 'captioned_short',
  status           text not null default 'queued'
                   check (status in ('queued','running','succeeded','failed')),
  current_step     text,
  language         text not null,
  request          jsonb not null,
  output_asset_id  uuid references public.assets(id),
  credits_charged  integer not null default 0,
  error            text,
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index on public.jobs (user_id, created_at desc);

-- ---------------------------------------------------------------
-- Generations: one AI provider call. Powers cost and margin analytics.
-- ---------------------------------------------------------------
create table public.generations (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null references public.jobs(id) on delete cascade,
  step               text not null check (step in ('voice','video','captions','render')),
  provider           text not null,
  model              text,
  language           text,
  voice_id           text,
  status             text not null check (status in ('succeeded','failed')),
  provider_cost_usd  numeric(10,4),
  latency_ms         integer,
  output_asset_id    uuid references public.assets(id),
  error              text,
  created_at         timestamptz not null default now()
);
create index on public.generations (job_id);
create index on public.generations (provider, language, created_at);

-- ---------------------------------------------------------------
-- Credit ledger: append-only. Balance = sum(delta).
-- ---------------------------------------------------------------
create table public.credit_ledger (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  delta              integer not null check (delta <> 0),
  reason             text not null check (reason in ('signup_bonus','purchase','subscription','generation','refund','admin')),
  job_id             uuid references public.jobs(id) on delete set null,
  stripe_payment_id  text,
  created_at         timestamptz not null default now()
);
create index on public.credit_ledger (user_id);
-- A job is charged at most once and refunded at most once
create unique index credit_ledger_one_charge on public.credit_ledger (job_id) where reason = 'generation';
create unique index credit_ledger_one_refund on public.credit_ledger (job_id) where reason = 'refund';
-- A Stripe payment is credited at most once (webhook retries are safe)
create unique index credit_ledger_one_payment on public.credit_ledger (stripe_payment_id) where stripe_payment_id is not null;

create view public.credit_balances with (security_invoker = true) as
  select user_id, coalesce(sum(delta), 0)::integer as balance
  from public.credit_ledger group by user_id;

-- ---------------------------------------------------------------
-- Presets: curated templates and voices (Ayiko's edge)
-- ---------------------------------------------------------------
create table public.presets (
  id            text primary key,
  name          text not null,
  template      text not null,
  language      text not null,
  voice_gender  text check (voice_gender in ('female','male')),
  motion_prompt text,
  active        boolean not null default true
);

-- ---------------------------------------------------------------
-- Credit functions (called by the server with the service role)
-- ---------------------------------------------------------------
create or replace function public.spend_credits(p_user uuid, p_amount integer, p_job uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_balance integer;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  -- serialise spends per user so two jobs can't overdraw at once
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select coalesce(sum(delta), 0) into v_balance from credit_ledger where user_id = p_user;
  if v_balance < p_amount then
    raise exception 'insufficient_credits' using errcode = 'P0001', detail = v_balance::text;
  end if;
  insert into credit_ledger (user_id, delta, reason, job_id) values (p_user, -p_amount, 'generation', p_job);
  return v_balance - p_amount;
end $$;

create or replace function public.refund_job(p_job uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_amount integer;
begin
  select user_id, -delta into v_user, v_amount
    from credit_ledger where job_id = p_job and reason = 'generation';
  if v_user is null then return 0; end if;
  insert into credit_ledger (user_id, delta, reason, job_id)
    values (v_user, v_amount, 'refund', p_job)
    on conflict do nothing;
  return v_amount;
end $$;

create or replace function public.grant_credits(p_user uuid, p_amount integer, p_reason text, p_stripe_payment_id text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into credit_ledger (user_id, delta, reason, stripe_payment_id)
    values (p_user, p_amount, p_reason, p_stripe_payment_id)
    on conflict do nothing;
end $$;

revoke all on function public.spend_credits(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.refund_job(uuid) from public, anon, authenticated;
revoke all on function public.grant_credits(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.spend_credits(uuid, integer, uuid) to service_role;
grant execute on function public.refund_job(uuid) to service_role;
grant execute on function public.grant_credits(uuid, integer, text, text) to service_role;

-- New users get a profile and 20 free credits
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  insert into credit_ledger (user_id, delta, reason) values (new.id, 20, 'signup_bonus');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- Row-level security: users read their own rows; writes go through the server
-- ---------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.projects      enable row level security;
alter table public.assets        enable row level security;
alter table public.jobs          enable row level security;
alter table public.generations   enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.presets       enable row level security;

create policy "own profile"      on public.profiles      for select using (id = auth.uid());
create policy "update own profile" on public.profiles    for update using (id = auth.uid());
create policy "own projects"     on public.projects      for all    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own assets"       on public.assets        for select using (user_id = auth.uid());
create policy "own jobs"         on public.jobs          for select using (user_id = auth.uid());
create policy "own generations"  on public.generations   for select using (exists (select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid()));
create policy "own ledger"       on public.credit_ledger for select using (user_id = auth.uid());
create policy "read presets"     on public.presets       for select using (active);

-- ---------------------------------------------------------------
-- Launch presets
-- ---------------------------------------------------------------
insert into public.presets (id, name, template, language, voice_gender, motion_prompt) values
  ('promo-twi',  'Product promo · Twi',     'product_promo', 'twi', 'female', 'slow push-in on the product, soft natural light, gentle fabric movement'),
  ('promo-yo',   'Product promo · Yoruba',  'product_promo', 'yo',  'female', 'slow push-in on the product, soft natural light'),
  ('promo-pcm',  'Product promo · Pidgin',  'product_promo', 'pcm', 'male',   'energetic handheld orbit around the product'),
  ('promo-en',   'Product promo · English', 'product_promo', 'en',  'female', 'slow push-in on the product, soft natural light'),
  ('church-twi', 'Church announcement · Twi', 'church_announcement', 'twi', 'male', 'warm light, slow upward tilt'),
  ('creator-en', 'Creator short · English', 'creator_short', 'en',  'male',   'dynamic zoom with subtle parallax');
