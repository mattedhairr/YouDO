-- Run this if user_backups already exists. Safe to re-run.

create table if not exists public.user_backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  backup_data text not null,
  created_at timestamptz not null default now()
);

create index if not exists user_backup_snapshots_user_created
  on public.user_backup_snapshots (user_id, created_at desc);

alter table public.user_backup_snapshots enable row level security;

drop policy if exists "Users can read their own snapshots" on public.user_backup_snapshots;
drop policy if exists "Users can insert their own snapshots" on public.user_backup_snapshots;
drop policy if exists "Users can delete their own snapshots" on public.user_backup_snapshots;

create policy "Users can read their own snapshots"
  on public.user_backup_snapshots for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own snapshots"
  on public.user_backup_snapshots for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own snapshots"
  on public.user_backup_snapshots for delete to authenticated
  using ((select auth.uid()) = user_id);
