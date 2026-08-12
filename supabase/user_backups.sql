-- Run this SQL in your Supabase Dashboard > SQL Editor

-- 1. Create the user_backups table
create table if not exists public.user_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  backup_data text not null,
  updated_at timestamptz not null default now()
);

-- 2. Enable Row Level Security
alter table public.user_backups enable row level security;

-- 3. Allow each user to only see and modify their own backup row
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

-- 4. Also disable email confirmation (run this too)
-- Go to: Dashboard > Authentication > Providers > Email > turn OFF "Confirm email"
