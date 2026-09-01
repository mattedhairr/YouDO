-- Run once in the Supabase SQL editor (project that YouDO already uses for auth/backups).
-- Board stays hidden in-app until 10 people opt in; this table is still required.

create table if not exists public.public_pace (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  exam_label text not null default '',
  today_ms bigint not null default 0,
  week_ms bigint not null default 0,
  month_ms bigint not null default 0,
  streak integer not null default 0,
  bar_hours numeric not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.public_pace enable row level security;

drop policy if exists pace_select_auth on public.public_pace;
drop policy if exists pace_insert_own on public.public_pace;
drop policy if exists pace_update_own on public.public_pace;
drop policy if exists pace_delete_own on public.public_pace;

create policy pace_select_auth
  on public.public_pace for select to authenticated
  using (true);

create policy pace_insert_own
  on public.public_pace for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy pace_update_own
  on public.public_pace for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy pace_delete_own
  on public.public_pace for delete to authenticated
  using ((select auth.uid()) = user_id);
