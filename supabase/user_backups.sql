-- Run this SQL in your Supabase Dashboard > SQL Editor

create table if not exists public.user_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  backup_data text not null,
  updated_at timestamptz not null default now()
);

-- Older projects may already have the equivalent user_backups_user_id_key
-- constraint. Add an index only when no one-column unique guarantee exists;
-- do not create a redundant index merely because its name differs.
do $user_backups_unique$
begin
  if not exists (
    select 1
    from pg_catalog.pg_index i
    join pg_catalog.pg_class t on t.oid = i.indrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    join pg_catalog.pg_attribute a
      on a.attrelid = t.oid and a.attname = 'user_id'
    where n.nspname = 'public'
      and t.relname = 'user_backups'
      and i.indisunique
      and i.indnkeyatts = 1
      and a.attnum = any(i.indkey::smallint[])
  ) then
    create unique index user_backups_user_id_unique
      on public.user_backups (user_id);
  end if;
end $user_backups_unique$;

alter table public.user_backups enable row level security;

drop policy if exists "Users can read their own backup" on public.user_backups;
drop policy if exists "Users can insert their own backup" on public.user_backups;
drop policy if exists "Users can update their own backup" on public.user_backups;
drop policy if exists "Users can delete their own backup" on public.user_backups;

create policy "Users can read their own backup"
  on public.user_backups for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own backup"
  on public.user_backups for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own backup"
  on public.user_backups for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own backup"
  on public.user_backups for delete to authenticated
  using ((select auth.uid()) = user_id);

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
  on public.user_backup_snapshots for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own snapshots"
  on public.user_backup_snapshots for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own snapshots"
  on public.user_backup_snapshots for delete to authenticated
  using ((select auth.uid()) = user_id);
