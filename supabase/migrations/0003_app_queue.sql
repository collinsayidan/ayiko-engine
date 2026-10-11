-- Ayiko.ai app: job queue for the render worker, private media bucket,
-- and the function the website uses to create (and pay for) a generation.
-- Run after 0001_init.sql and 0002_waitlist.sql.

-- ---------------------------------------------------------------
-- Queue columns on jobs
-- ---------------------------------------------------------------
alter table public.jobs
  add column if not exists batch_id      uuid,
  add column if not exists depends_on    uuid references public.jobs(id) on delete set null,
  add column if not exists attempts      integer not null default 0,
  add column if not exists locked_by     text,
  add column if not exists heartbeat_at  timestamptz,
  add column if not exists started_at    timestamptz,
  add column if not exists clip_key      text,
  add column if not exists voice_key     text,
  add column if not exists output_key    text,
  add column if not exists duration_s    numeric(8,2);

create index if not exists jobs_queue_idx on public.jobs (status, created_at) where status in ('queued', 'running');
create index if not exists jobs_batch_idx on public.jobs (batch_id);

-- ---------------------------------------------------------------
-- create_generation: one project, one job per language, all charged
-- in a single transaction. If the user can't afford all of it,
-- nothing is created and nothing is charged.
--
-- p_jobs: [{ "language": "twi", "credits": 13, "request": {...} }, ...]
-- The first job makes the AI clip; the others wait for it and reuse it.
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

  -- One user can't flood the queue
  select count(*) into v_active from jobs where user_id = p_user and status in ('queued', 'running');
  if v_active + jsonb_array_length(p_jobs) > 12 then
    raise exception 'too_many_active_jobs' using errcode = 'P0001';
  end if;

  insert into projects (user_id, template, title) values (p_user, p_template, left(coalesce(nullif(p_title, ''), 'Untitled video'), 120))
    returning id into v_project;

  for v_item in select * from jsonb_array_elements(p_jobs) loop
    insert into jobs (user_id, project_id, language, request, status, batch_id, depends_on, credits_charged)
      values (p_user, v_project, v_item->>'language', v_item->'request', 'queued', v_batch,
              case when i = 0 then null else v_lead end, (v_item->>'credits')::integer)
      returning id into v_job;
    if i = 0 then v_lead := v_job; end if;
    v_bal := spend_credits(p_user, (v_item->>'credits')::integer, v_job);
    job_id := v_job; language := v_item->>'language'; credits := (v_item->>'credits')::integer; balance_after := v_bal;
    return next;
    i := i + 1;
  end loop;
end $$;

-- ---------------------------------------------------------------
-- claim_job: the worker takes the oldest job that is ready to run.
-- Ready = queued and (no dependency, or its dependency succeeded),
-- or running but abandoned (no heartbeat for 10 minutes) with retries left.
-- SKIP LOCKED lets several workers share one queue safely.
-- ---------------------------------------------------------------
create or replace function public.claim_job(p_worker text)
returns setof public.jobs
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select j.id into v_id
    from jobs j
    left join jobs d on d.id = j.depends_on
   where (j.status = 'queued' and (j.depends_on is null or d.status = 'succeeded'))
      or (j.status = 'running' and j.heartbeat_at < now() - interval '10 minutes' and j.attempts < 3)
   order by j.created_at
   for update of j skip locked
   limit 1;

  if v_id is null then return; end if;

  return query
    update jobs
       set status = 'running', attempts = attempts + 1, locked_by = p_worker,
           heartbeat_at = now(), started_at = coalesce(started_at, now()), error = null
     where id = v_id
    returning *;
end $$;

-- ---------------------------------------------------------------
-- fail_job: mark failed and refund. Also fails and refunds any job
-- waiting on this one (its clip will never exist).
-- ---------------------------------------------------------------
create or replace function public.fail_job(p_job uuid, p_error text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dep uuid;
begin
  update jobs set status = 'failed', error = left(p_error, 500), current_step = null, finished_at = now()
   where id = p_job and status <> 'succeeded';
  perform refund_job(p_job);
  for v_dep in select id from jobs where depends_on = p_job and status in ('queued', 'running') loop
    perform fail_job(v_dep, 'The first language failed, so this one could not be made. Your credits were refunded.');
  end loop;
end $$;

-- ---------------------------------------------------------------
-- reap_stale_jobs: abandoned jobs that used up their retries fail and refund.
-- ---------------------------------------------------------------
create or replace function public.reap_stale_jobs()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  n integer := 0;
begin
  for v_id in select id from jobs
               where status = 'running' and heartbeat_at < now() - interval '10 minutes' and attempts >= 3
               for update skip locked loop
    perform fail_job(v_id, 'The video took too long to make. Your credits were refunded.');
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.create_generation(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.claim_job(text) from public, anon, authenticated;
revoke all on function public.fail_job(uuid, text) from public, anon, authenticated;
revoke all on function public.reap_stale_jobs() from public, anon, authenticated;
grant execute on function public.create_generation(uuid, text, text, jsonb) to service_role;
grant execute on function public.claim_job(text) to service_role;
grant execute on function public.fail_job(uuid, text) to service_role;
grant execute on function public.reap_stale_jobs() to service_role;

-- ---------------------------------------------------------------
-- Private media bucket: uploads and finished videos.
-- No storage policies, so browsers can't list or read it directly;
-- the website hands out short-lived signed URLs instead.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/wav', 'video/mp4'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- Worker status: each render worker checks in every 30 seconds with
-- the languages it has voices for. The website only offers those
-- languages, and shows "studio offline" if no worker checked in lately.
-- ---------------------------------------------------------------
create table if not exists public.worker_status (
  worker_id  text primary key,
  languages  text[] not null default '{}',
  info       jsonb not null default '{}',
  seen_at    timestamptz not null default now()
);
alter table public.worker_status enable row level security;
-- No policies: only the server reads and writes it.
