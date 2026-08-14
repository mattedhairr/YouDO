-- Run this SQL in your Supabase Dashboard > SQL Editor

create table if not exists public.user_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  backup_data text not null,
  updated_at timestamptz not null default now()
);

create unique index if not exists user_backups_user_id_unique
  on public.user_backups (user_id);

alter table public.user_backups enable row level security;

drop policy if exists "Users can read their own backup" on public.user_backups;
drop policy if exists "Users can insert their own backup" on public.user_backups;
drop policy if exists "Users can update their own backup" on public.user_backups;
drop policy if exists "Users can delete their own backup" on public.user_backups;

create policy "Users can read their own backup"
  on public.user_backups for select
  using (auth.uid() = user_id);

create policy "Users can insert their own backup"
  on public.user_backups for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own backup"
  on public.user_backups for update
  using (auth.uid() = user_id);

create policy "Users can delete their own backup"
  on public.user_backups for delete
  using (auth.uid() = user_id);

-- Rolling last-3 visit snapshots (frozen on first sync after app open)
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
  on public.user_backup_snapshots for select
  using (auth.uid() = user_id);

create policy "Users can insert their own snapshots"
  on public.user_backup_snapshots for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own snapshots"
  on public.user_backup_snapshots for delete
  using (auth.uid() = user_id);
