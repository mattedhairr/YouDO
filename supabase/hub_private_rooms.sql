-- Supabase Snippet Name: YouDO - Hub & Private Rooms Schema
-- Creates profiles, friendships, and private squads (rooms)

-- 1. Profiles Table (Core Identity)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  display_name text not null,
  bio text default '',
  stats_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Force usernames to be lowercase and alphanumeric (plus underscores)
alter table public.profiles add constraint valid_username check (username ~ '^[a-z0-9_]+$');

-- 2. Friendships Table
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  receiver_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(requester_id, receiver_id)
);

-- 3. Squads Table (The Private Rooms)
create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  bar_hours numeric not null default 1,
  allow_join_requests boolean not null default true,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 4. Squad Members Table
create table if not exists public.squad_members (
  squad_id uuid not null references public.squads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'accepted' check (status in ('pending', 'invited', 'accepted')),
  joined_at timestamptz not null default now(),
  primary key (squad_id, user_id)
);

-- 5. Direct Messages Table (Strictly 1-on-1, No Admin Bypass)
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  receiver_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- 6. Squad Room Messages Table (Strictly Accepted Room Members Only, No Admin Bypass)
create table if not exists public.squad_messages (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- Turn on Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.squads enable row level security;
alter table public.squad_members enable row level security;
alter table public.direct_messages enable row level security;
alter table public.squad_messages enable row level security;

-- STRICT PRIVACY POLICIES (NO ADMIN OVERRIDES)

-- Profiles: Anyone can read profiles. Users can only update their own.
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Friendships: Only participants can view their friendships.
create policy "Users view own friendships" on public.friendships for select using (auth.uid() = requester_id or auth.uid() = receiver_id);
create policy "Users can insert friendships" on public.friendships for insert with check (auth.uid() = requester_id);
create policy "Users can update own friendships" on public.friendships for update using (auth.uid() = requester_id or auth.uid() = receiver_id);

-- Squads: STRICTLY member-only visibility. Non-members and admins cannot view squads they are not in.
create policy "Users view squads they are in" on public.squads for select using (
  exists (select 1 from public.squad_members where squad_id = squads.id and user_id = auth.uid() and status = 'accepted')
);
create policy "Users can create squads" on public.squads for insert with check (auth.uid() = created_by);

-- Squad Members: STRICTLY member-only visibility.
create policy "Users view members of their squads" on public.squad_members for select using (
  exists (select 1 from public.squad_members sm where sm.squad_id = squad_members.squad_id and sm.user_id = auth.uid() and sm.status = 'accepted')
);
create policy "Users can join squads" on public.squad_members for insert with check (auth.uid() = user_id);

-- Direct Messages: ZERO ADMIN BYPASS. Only sender or receiver can select or send.
create policy "DMs viewable only by participants" on public.direct_messages for select using (
  auth.uid() = sender_id or auth.uid() = receiver_id
);
create policy "Users send DMs as themselves" on public.direct_messages for insert with check (
  auth.uid() = sender_id
);

-- Squad Messages: ZERO ADMIN BYPASS. Strictly accepted members can view and post.
create policy "Squad messages viewable only by accepted members" on public.squad_messages for select using (
  exists (select 1 from public.squad_members where squad_id = squad_messages.squad_id and user_id = auth.uid() and status = 'accepted')
);
create policy "Squad members can post messages" on public.squad_messages for insert with check (
  auth.uid() = sender_id and
  exists (select 1 from public.squad_members where squad_id = squad_messages.squad_id and user_id = auth.uid() and status = 'accepted')
);
