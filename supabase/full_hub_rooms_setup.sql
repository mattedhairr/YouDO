-- Supabase Snippet Name: YouDO — Complete Private Hub & Rooms Setup (From Main)
-- File: supabase/full_hub_rooms_setup.sql
-- Description: Consolidated migration starting directly from main's schema.
-- Creates profiles, friendships, squads (rooms), members, DMs, squad messages, RLS, RPCs, and Realtime.
-- Idempotent and safe to run multiple times.

begin;

-- ============================================================================
-- 1. Profiles Table (Core Identity)
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  display_name text not null,
  bio text default '',
  stats_private boolean not null default false,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists avatar_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'valid_username' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint valid_username check (username ~ '^[a-z0-9_]+$');
  end if;
end $$;

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.profiles to anon;

-- ============================================================================
-- 2. Friendships Table
-- ============================================================================
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  receiver_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  request_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(requester_id, receiver_id)
);

alter table public.friendships add column if not exists request_message text not null default '';

grant select, insert, update, delete on table public.friendships to authenticated;

-- ============================================================================
-- 3. Squads Table (Private & Semi-Private Rooms)
-- ============================================================================
create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  privacy text not null default 'anyone_can_join' check (privacy in ('anyone_can_join', 'invite_only')),
  bar_hours numeric default null,
  allow_join_requests boolean not null default true,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.squads
  add column if not exists privacy text not null default 'anyone_can_join'
  check (privacy in ('anyone_can_join', 'invite_only'));

alter table public.squads
  add column if not exists allow_join_requests boolean not null default true;

alter table public.squads alter column bar_hours drop not null;
alter table public.squads alter column bar_hours set default null;

grant select, insert, update, delete on table public.squads to authenticated;

-- ============================================================================
-- 4. Squad Members Table
-- ============================================================================
create table if not exists public.squad_members (
  squad_id uuid not null references public.squads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'accepted' check (status in ('pending', 'invited', 'accepted')),
  joined_at timestamptz not null default now(),
  primary key (squad_id, user_id)
);

grant select, insert, update, delete on table public.squad_members to authenticated;

-- ============================================================================
-- 5. Direct Messages Table (Strictly 1-on-1)
-- ============================================================================
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  receiver_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  reply_to_id uuid references public.direct_messages (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on table public.direct_messages to authenticated;

-- ============================================================================
-- 6. Squad Room Messages Table (Strictly Accepted Room Members)
-- ============================================================================
create table if not exists public.squad_messages (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  reply_to_id uuid references public.squad_messages (id) on delete set null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on table public.squad_messages to authenticated;

-- ============================================================================
-- 7. Row Level Security Activation
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.squads enable row level security;
alter table public.squad_members enable row level security;
alter table public.direct_messages enable row level security;
alter table public.squad_messages enable row level security;

-- ============================================================================
-- 8. Security Definer Helper Functions
-- ============================================================================
create or replace function public.is_accepted_squad_member(p_squad_id uuid, p_user_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id and user_id = p_user_id and status = 'accepted'
  );
$$;

revoke all on function public.is_accepted_squad_member(uuid, uuid) from public, anon;
grant execute on function public.is_accepted_squad_member(uuid, uuid) to authenticated;

create or replace function public.is_squad_admin(p_squad_id uuid, p_user_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id and user_id = p_user_id and role = 'admin' and status = 'accepted'
  );
$$;

revoke all on function public.is_squad_admin(uuid, uuid) from public, anon;
grant execute on function public.is_squad_admin(uuid, uuid) to authenticated;

create or replace function public.is_squad_member_or_invited(p_squad_id uuid, p_user_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id
      and user_id = p_user_id
      and status in ('accepted', 'invited')
  );
$$;

revoke all on function public.is_squad_member_or_invited(uuid, uuid) from public, anon;
grant execute on function public.is_squad_member_or_invited(uuid, uuid) to authenticated;

-- ============================================================================
-- 9. Complete RLS Policies
-- ============================================================================

-- Profiles Policies
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Friendships Policies
drop policy if exists "Users view own friendships" on public.friendships;
create policy "Users view own friendships" on public.friendships for select using (
  auth.uid() = requester_id or auth.uid() = receiver_id
);

drop policy if exists "Users can insert friendships" on public.friendships;
create policy "Users can insert friendships" on public.friendships for insert with check (
  auth.uid() = requester_id
);

drop policy if exists "Users can update own friendships" on public.friendships;
create policy "Users can update own friendships" on public.friendships for update using (
  auth.uid() = requester_id or auth.uid() = receiver_id
);

drop policy if exists "Participants can delete friendships" on public.friendships;
create policy "Participants can delete friendships" on public.friendships for delete using (
  auth.uid() = requester_id or auth.uid() = receiver_id
);

-- Squads Policies
drop policy if exists "Users view squads they are in" on public.squads;
create policy "Users view squads they are in" on public.squads for select using (
  auth.uid() = created_by
  or privacy = 'anyone_can_join'
  or public.is_squad_member_or_invited(squads.id, auth.uid())
);

drop policy if exists "Users can create squads" on public.squads;
create policy "Users can create squads" on public.squads for insert with check (
  auth.uid() = created_by
);

drop policy if exists "Squad admins update squads" on public.squads;
create policy "Squad admins update squads" on public.squads for update using (
  auth.uid() = created_by
  or public.is_squad_admin(squads.id, auth.uid())
);

-- Squad Members Policies
drop policy if exists "Users view members of their squads" on public.squad_members;
create policy "Users view members of their squads" on public.squad_members for select using (
  auth.uid() = user_id
  or public.is_accepted_squad_member(squad_members.squad_id, auth.uid())
  or public.is_squad_admin(squad_members.squad_id, auth.uid())
);

drop policy if exists "Users can join squads" on public.squad_members;
create policy "Users can join squads" on public.squad_members for insert with check (
  (
    auth.uid() = user_id
    and exists (
      select 1 from public.squads s
      where s.id = squad_members.squad_id
        and (s.privacy = 'anyone_can_join' or s.created_by = auth.uid())
    )
  )
  or (
    (
      public.is_squad_admin(squad_members.squad_id, auth.uid())
      or exists (
        select 1 from public.squads s
        where s.id = squad_members.squad_id
          and s.created_by = auth.uid()
      )
    )
    and status = 'invited'
  )
);

drop policy if exists "Members can leave or admins can remove" on public.squad_members;
create policy "Members can leave or admins can remove" on public.squad_members for delete using (
  auth.uid() = user_id
  or exists (
    select 1 from public.squad_members sm
    where sm.squad_id = squad_members.squad_id
      and sm.user_id = auth.uid()
      and sm.role = 'admin'
      and sm.status = 'accepted'
  )
);

-- Direct Messages Policies
drop policy if exists "DMs viewable only by participants" on public.direct_messages;
create policy "DMs viewable only by participants" on public.direct_messages for select using (
  auth.uid() = sender_id or auth.uid() = receiver_id
);

drop policy if exists "Users send DMs as themselves" on public.direct_messages;
create policy "Users send DMs as themselves" on public.direct_messages for insert with check (
  auth.uid() = sender_id
);

drop policy if exists "Receivers can mark DMs read" on public.direct_messages;
create policy "Receivers can mark DMs read" on public.direct_messages for update using (
  auth.uid() = receiver_id
) with check (auth.uid() = receiver_id);

drop policy if exists "Senders can delete own DMs" on public.direct_messages;
create policy "Senders can delete own DMs" on public.direct_messages for delete using (
  auth.uid() = sender_id
);

-- Squad Messages Policies
drop policy if exists "Squad messages viewable only by accepted members" on public.squad_messages;
create policy "Squad messages viewable only by accepted members" on public.squad_messages for select using (
  public.is_accepted_squad_member(squad_messages.squad_id, auth.uid())
);

drop policy if exists "Squad members can post messages" on public.squad_messages;
create policy "Squad members can post messages" on public.squad_messages for insert with check (
  auth.uid() = sender_id
  and public.is_accepted_squad_member(squad_messages.squad_id, auth.uid())
);

drop policy if exists "Senders can delete own squad messages" on public.squad_messages;
create policy "Senders can delete own squad messages" on public.squad_messages for delete using (
  auth.uid() = sender_id
);

-- ============================================================================
-- 10. RPC Functions (Discover & Username Invites)
-- ============================================================================

create or replace function public.discover_squads()
returns setof public.squads
language sql
security definer
stable
set search_path = public
as $$
  select s.*
  from public.squads s
  where s.privacy = 'anyone_can_join'
    and s.allow_join_requests = true
    and auth.uid() is not null
    and not exists (
      select 1 from public.squad_members sm
      where sm.squad_id = s.id
        and sm.user_id = auth.uid()
    );
$$;

revoke all on function public.discover_squads() from public, anon;
grant execute on function public.discover_squads() to authenticated;

create or replace function public.invite_to_squad_by_username(
  p_squad_id uuid,
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_id uuid;
  v_normalized text;
  v_is_admin boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Authentication required');
  end if;

  select (public.is_squad_admin(p_squad_id, auth.uid())
          or exists (select 1 from public.squads where id = p_squad_id and created_by = auth.uid()))
  into v_is_admin;

  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'Only squad admins can invite members');
  end if;

  v_normalized := lower(regexp_replace(btrim(p_username), '^@', ''));
  if v_normalized = '' or v_normalized is null then
    return jsonb_build_object('ok', false, 'error', 'Invalid username');
  end if;

  select id into v_target_id
  from public.profiles
  where username = v_normalized;

  if v_target_id is null then
    return jsonb_build_object('ok', false, 'error', 'User not found');
  end if;

  if v_target_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Cannot invite yourself');
  end if;

  if exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id and user_id = v_target_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'User is already in this squad or has a pending invite');
  end if;

  insert into public.squad_members (squad_id, user_id, role, status)
  values (p_squad_id, v_target_id, 'member', 'invited');

  return jsonb_build_object('ok', true, 'user_id', v_target_id);
end;
$$;

revoke all on function public.invite_to_squad_by_username(uuid, text) from public, anon;
grant execute on function public.invite_to_squad_by_username(uuid, text) to authenticated;

-- ============================================================================
-- 11. Board Name Removal & Profile Display Name Sync
-- ============================================================================

create or replace function public.sync_profile_name_to_public_pace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.public_pace
  set display_name = new.display_name
  where user_id = new.id
    and display_name is distinct from new.display_name;
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_name_to_public_pace on public.profiles;
create trigger trg_sync_profile_name_to_public_pace
  after insert or update of display_name on public.profiles
  for each row execute function public.sync_profile_name_to_public_pace();

create or replace function public.sync_public_pace_name_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select display_name into v_name
  from public.profiles
  where id = new.user_id;

  if v_name is not null and btrim(v_name) <> '' then
    new.display_name := v_name;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_public_pace_name_from_profile on public.public_pace;
create trigger trg_sync_public_pace_name_from_profile
  before insert or update of display_name on public.public_pace
  for each row execute function public.sync_public_pace_name_from_profile();

-- Backfill display_name from existing profiles if any
update public.public_pace p
set display_name = pr.display_name
from public.profiles pr
where p.user_id = pr.id
  and pr.display_name is not null
  and btrim(pr.display_name) <> ''
  and p.display_name is distinct from pr.display_name;

-- Update board_pace_rows(board_timezone text) to join profiles directly
create or replace function public.board_pace_rows(board_timezone text)
returns table(
  user_id uuid, display_name text, exam_label text, hashtag_id uuid, hashtag_label text,
  today_ms bigint, week_ms bigint, month_ms bigint, today_key date, week_key date,
  month_key date, streak integer, bar_hours numeric, updated_at timestamptz
) language plpgsql stable security definer set search_path = '' as $function$
declare anchor date;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = board_timezone) then
    raise exception 'Invalid timezone';
  end if;
  anchor := (now() at time zone board_timezone)::date;
  return query
    with days as (select * from public.board_focus_days(board_timezone)),
    totals as (
      select d.user_id,
        coalesce(sum(d.focus_ms) filter (where d.day_key = anchor), 0)::bigint as today_focus,
        coalesce(sum(d.focus_ms) filter (where d.day_key between date_trunc('week', anchor::timestamp)::date and anchor), 0)::bigint as week_focus,
        coalesce(sum(d.focus_ms) filter (where d.day_key between date_trunc('month', anchor::timestamp)::date and anchor), 0)::bigint as month_focus
      from days d group by d.user_id
    )
    select p.user_id,
      coalesce(nullif(btrim(pr.display_name), ''), p.display_name) as display_name,
      p.exam_label, h.id, h.label,
      coalesce(t.today_focus, 0), coalesce(t.week_focus, 0), coalesce(t.month_focus, 0),
      anchor, date_trunc('week', anchor::timestamp)::date,
      date_trunc('month', anchor::timestamp)::date,
      (
        select count(*)::integer from pg_catalog.generate_series(0, 89) n
        where n < coalesce((
          select min(m) from pg_catalog.generate_series(0, 89) m
          left join days dx on dx.user_id = p.user_id and dx.day_key =
            (case when coalesce(t.today_focus, 0) >= p.bar_hours * 3600000
              then anchor else anchor - 1 end) - m
          where coalesce(dx.focus_ms, 0) < p.bar_hours * 3600000
        ), 90)
      ) as streak,
      p.bar_hours, p.updated_at
    from public.public_pace p
    left join public.profiles pr on pr.id = p.user_id
    left join totals t on t.user_id = p.user_id
    left join public.community_hashtag_memberships hm on hm.user_id = p.user_id
    left join public.community_hashtags h on h.id = hm.hashtag_id and h.active;
end;
$function$;

revoke execute on function public.board_pace_rows(text) from public, anon;
grant execute on function public.board_pace_rows(text) to authenticated;

-- ============================================================================
-- 12. 24-Hour Message Pruning Integration
-- ============================================================================
create or replace function public.prune_community_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.community_messages cm where expires_at < now() - interval '7 days'
    and not exists (select 1 from public.community_reports r where r.message_id = cm.id and r.status = 'open');
  
  delete from public.board_appreciations where day_key < (now() at time zone 'UTC')::date - 31;
  delete from public.direct_messages where created_at < now() - interval '24 hours';
  delete from public.squad_messages where created_at < now() - interval '24 hours';

  return null;
end; $$;

drop trigger if exists prune_after_dm on public.direct_messages;
create trigger prune_after_dm after insert on public.direct_messages
  for each statement execute function public.prune_community_history();

drop trigger if exists prune_after_squad_msg on public.squad_messages;
create trigger prune_after_squad_msg after insert on public.squad_messages
  for each statement execute function public.prune_community_history();

-- ============================================================================
-- 13. Realtime Publications
-- ============================================================================
do $$
begin
  alter publication supabase_realtime add table public.squad_messages;
exception
  when duplicate_object then null;
end $$;

alter table public.squad_messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.squad_members;
exception
  when duplicate_object then null;
end $$;

alter table public.squad_members replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception
  when duplicate_object then null;
end $$;

alter table public.friendships replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception
  when duplicate_object then null;
end $$;

alter table public.direct_messages replica identity full;

commit;
