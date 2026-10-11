-- Public waitlist for ayiko.ai. Written only by the website's server (service role).
create table if not exists public.waitlist (
  id          bigint generated always as identity primary key,
  name        text not null,
  email       text not null unique,
  language    text,
  role        text,
  idea        text,
  country     text,
  source      text,
  created_at  timestamptz not null default now()
);

alter table public.waitlist enable row level security;
-- No policies: browsers can't read or write it; only the server's service role can.
