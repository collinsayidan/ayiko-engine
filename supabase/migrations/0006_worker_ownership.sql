-- Ayiko.ai: a worker can only fail (and refund) a job it still holds.
-- Run after 0005_editor_email_admin.sql.
--
-- If a worker goes quiet, another worker may claim its job, or the reaper may
-- fail and refund it. When the first worker comes back, its writes must not
-- land: the worker now checks locked_by and status on every update, and
-- fail_job takes the worker's id for the same check.
--
-- fail_job also no longer refunds a job that has already succeeded (before,
-- the status update was skipped but the refund still ran).

drop function if exists public.fail_job(uuid, text);

create or replace function public.fail_job(p_job uuid, p_error text, p_worker text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dep uuid;
begin
  -- p_worker null: the reaper or a cascade, which may fail any unfinished job.
  update jobs set status = 'failed', error = left(p_error, 500), current_step = null, finished_at = now()
   where id = p_job
     and (case when p_worker is null then status in ('queued', 'running')
               else status = 'running' and locked_by = p_worker end);
  if not found then return; end if;

  perform refund_job(p_job);
  for v_dep in select id from jobs where depends_on = p_job and status in ('queued', 'running') loop
    perform fail_job(v_dep, 'The first language failed, so this one could not be made. Your credits were refunded.');
  end loop;
end $$;

revoke all on function public.fail_job(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fail_job(uuid, text, text) to service_role;
