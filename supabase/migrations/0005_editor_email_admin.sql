-- Ayiko.ai: editing canvas re-renders, "video ready" emails, payments
-- record for revenue, script-assistant usage limits and admin stats.
-- Run after 0004_billing.sql.

-- ---------------------------------------------------------------
-- create_generation: an item may carry clip_key / voice_key to reuse
-- an existing clip and voice (editing canvas re-render: 1 credit).
-- The website only passes keys read from the user's own job row.
-- ---------------------------------------------------------------
create or replace function public.create_generation(
  p_user uuid, p_template text, p_title text, p_jobs jsonb
) returns table (job_id uuid, language text, credits integer, balance_after integer)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_project uuid;
  v_batch   uuid := gen_random_uuid();
  v_lead    uuid;
  v_job     uuid;
  v_item    jsonb;
  v_bal     integer;
  v_active  integer;
  i         integer := 0;
begin
  if jsonb_typeof(p_jobs) <> 'array' or jsonb_array_length(p_jobs) = 0 then
    raise exception 'no_jobs' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_jobs) > 6 then
    raise exception 'too_many_languages' using errcode = 'P0001';
  end if;
  select count(*) into v_active from jobs where user_id = p_user and status in ('queued', 'running');
  if v_active + jsonb_array_length(p_jobs) > 12 then
    raise exception 'too_many_active_jobs' using errcode = 'P0001';
  end if;

  insert into projects (user_id, template, title) values (p_user, p_template, left(coalesce(nullif(p_title, ''), 'Untitled video'), 120))
    returning id into v_project;

  for v_item in select * from jsonb_array_elements(p_jobs) loop
    insert into jobs (user_id, project_id, language, request, status, batch_id, depends_on, credits_charged, clip_key, voice_key)
      values (p_user, v_project, v_item->>'language', v_item->'request', 'queued', v_batch,
              case when i = 0 or (v_item->>'clip_key') is not null then null else v_lead end,
              (v_item->>'credits')::integer, v_item->>'clip_key', v_item->>'voice_key')
      returning id into v_job;
    if i = 0 then v_lead := v_job; end if;
    v_bal := spend_credits(p_user, (v_item->>'credits')::integer, v_job);
    job_id := v_job; language := v_item->>'language'; credits := (v_item->>'credits')::integer; balance_after := v_bal;
    return next;
    i := i + 1;
  end loop;
end $$;

-- ---------------------------------------------------------------
-- "Your video is ready" email: one per batch, once every language
-- has finished. Users can switch it off.
-- ---------------------------------------------------------------
alter table public.jobs add column if not exists notified_at timestamptz;
alter table public.profiles add column if not exists email_updates boolean not null default true;

create or replace function public.claim_batch_notification(p_batch uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  if p_batch is null then return null; end if;
  if exists (select 1 from jobs where batch_id = p_batch and status in ('queued', 'running')) then
    return null;
  end if;
  with u as (
    update jobs set notified_at = now()
     where batch_id = p_batch and notified_at is null
    returning user_id
  )
  select user_id into v_user from u limit 1;
  return v_user;
end $$;

-- ---------------------------------------------------------------
-- Payments: money received, for the revenue dashboard. Written by
-- the Stripe webhook; each Stripe reference is recorded once.
-- ---------------------------------------------------------------
create table if not exists public.payments (
  id            bigint generated always as identity primary key,
  user_id       uuid references public.profiles(id) on delete set null,
  stripe_ref    text not null unique,
  plan          text,
  amount_pence  integer not null,
  currency      text not null default 'gbp',
  created_at    timestamptz not null default now()
);
alter table public.payments enable row level security;
create policy "own payments" on public.payments for select using (user_id = auth.uid());

-- ---------------------------------------------------------------
-- Script assistant usage (drafting and translation), for daily limits.
-- ---------------------------------------------------------------
create table if not exists public.assist_usage (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('draft', 'translate')),
  created_at  timestamptz not null default now()
);
create index if not exists assist_usage_user_time on public.assist_usage (user_id, created_at desc);
alter table public.assist_usage enable row level security;

-- ---------------------------------------------------------------
-- admin_stats: everything the admin dashboard shows, in one call.
-- Server only (service role). Provider costs are estimates where the
-- provider doesn't report a price.
-- ---------------------------------------------------------------
create or replace function public.admin_stats(p_days integer default 30)
returns jsonb
language sql security definer set search_path = public stable as $$
  with since as (select now() - make_interval(days => p_days) as t),
  days as (
    select generate_series((now() - make_interval(days => p_days - 1))::date, now()::date, '1 day')::date as d
  )
  select jsonb_build_object(
    'users', jsonb_build_object(
      'total', (select count(*) from profiles),
      'last7', (select count(*) from profiles where created_at > now() - interval '7 days'),
      'paying', (select count(*) from billing where status in ('active', 'trialing', 'past_due')),
      'byDay', (select coalesce(jsonb_agg(jsonb_build_object('d', days.d, 'n', (select count(*) from profiles p where p.created_at::date = days.d)) order by days.d), '[]') from days)
    ),
    'videos', jsonb_build_object(
      'total', (select count(*) from jobs where status = 'succeeded'),
      'period', (select count(*) from jobs, since where status = 'succeeded' and created_at > since.t),
      'failed', (select count(*) from jobs, since where status = 'failed' and created_at > since.t),
      'inQueue', (select count(*) from jobs where status in ('queued', 'running')),
      'byDay', (select coalesce(jsonb_agg(jsonb_build_object('d', days.d, 'n', (select count(*) from jobs j where j.status = 'succeeded' and j.created_at::date = days.d)) order by days.d), '[]') from days),
      'byLanguage', (select coalesce(jsonb_agg(x order by x->>'n' desc), '[]') from (
        select jsonb_build_object('language', language, 'n', count(*), 'credits', sum(credits_charged)) as x
          from jobs, since where status = 'succeeded' and created_at > since.t group by language) q)
    ),
    'revenue', jsonb_build_object(
      'totalPence', (select coalesce(sum(amount_pence), 0) from payments),
      'periodPence', (select coalesce(sum(amount_pence), 0) from payments, since where created_at > since.t),
      'byDay', (select coalesce(jsonb_agg(jsonb_build_object('d', days.d, 'pence', (select coalesce(sum(amount_pence), 0) from payments pm where pm.created_at::date = days.d)) order by days.d), '[]') from days),
      'byPlan', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('plan', coalesce(plan, 'other'), 'pence', sum(amount_pence), 'n', count(*)) as x
          from payments, since where created_at > since.t group by plan) q)
    ),
    'providers', (select coalesce(jsonb_agg(x order by (x->>'costUsd')::numeric desc), '[]') from (
      select jsonb_build_object(
        'language', coalesce(language, '—'), 'provider', provider, 'step', step,
        'calls', count(*),
        'failed', count(*) filter (where status = 'failed'),
        'costUsd', round(coalesce(sum(provider_cost_usd), 0), 2),
        'avgSeconds', round(avg(latency_ms) / 1000.0, 1)
      ) as x
      from generations, since where created_at > since.t and step in ('voice', 'video')
      group by language, provider, step) q),
    'credits', jsonb_build_object(
      'spentPeriod', (select coalesce(-sum(delta), 0) from credit_ledger, since where reason = 'generation' and created_at > since.t),
      'refundedPeriod', (select coalesce(sum(delta), 0) from credit_ledger, since where reason = 'refund' and created_at > since.t)
    ),
    'recentUsers', (select coalesce(jsonb_agg(x), '[]') from (
      select jsonb_build_object('name', p.display_name, 'joined', p.created_at,
        'videos', (select count(*) from jobs j where j.user_id = p.id and j.status = 'succeeded'),
        'plan', coalesce(b.plan, 'free')) as x
      from profiles p left join billing b on b.user_id = p.id order by p.created_at desc limit 12) q)
  );
$$;

revoke all on function public.claim_batch_notification(uuid) from public, anon, authenticated;
revoke all on function public.admin_stats(integer) from public, anon, authenticated;
grant execute on function public.claim_batch_notification(uuid) to service_role;
grant execute on function public.admin_stats(integer) to service_role;
