-- Supabase Snippet Name: YouDO — Rooms Privacy, Username Invites & Board Name Removal
-- File: supabase/rooms_privacy_and_invites.sql
-- Milestone 1 (R1) Database Schema & Supabase Migrations
-- Applies on top of hub_private_rooms.sql, hub_private_fixup.sql, and board_evidence.sql.
-- Idempotent: safe to run multiple times.

begin;

-- ============================================================================
-- 1. Squads Table Alterations (Privacy & Bar Hours)
-- ============================================================================

-- Add privacy column with check constraint ('anyone_can_join' vs 'invite_only')
alter table public.squads
  add column if not exists privacy text not null default 'anyone_can_join'
  check (privacy in ('anyone_can_join', 'invite_only'));

-- Make bar_hours nullable and default to null so room pace is optional
alter table public.squads alter column bar_hours drop not null;
alter table public.squads alter column bar_hours set default null;

-- Sync privacy for any legacy squads that disallowed join requests
update public.squads
set privacy = 'invite_only'
where allow_join_requests = false and privacy = 'anyone_can_join';

-- Explicit table grants for authenticated users
grant select, insert, update, delete on table public.squads to authenticated;
grant select, insert, update, delete on table public.squad_members to authenticated;

-- ============================================================================
-- 2. Helper Security Definer Functions
-- ============================================================================

-- Check if user is either an accepted member OR an invited user of a squad
create or replace function public.is_squad_member_or_invited(p_squad_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
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
-- 3. Squads RLS Policies
-- ============================================================================

-- Allow users to view squads if they created them, are accepted members, OR are invited
drop policy if exists "Users view squads they are in" on public.squads;
create policy "Users view squads they are in" on public.squads for select using (
  auth.uid() = created_by
  or privacy = 'anyone_can_join'
  or public.is_squad_member_or_invited(squads.id, auth.uid())
);

-- Allow squad admins and creators to update squad settings (e.g. privacy, name)
drop policy if exists "Squad admins update squads" on public.squads;
create policy "Squad admins update squads" on public.squads for update using (
  auth.uid() = created_by
  or public.is_squad_admin(squads.id, auth.uid())
);

-- ============================================================================
-- 4. Discover Squads Function (Privacy Gate)
-- ============================================================================

-- Discover list: only show 'anyone_can_join' squads that allow join requests
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

-- ============================================================================
-- 5. Squad Members RLS Insert Policy (Self-Join vs Admin Invite)
-- ============================================================================

-- Self-joins are only permitted on 'anyone_can_join' squads (or creator self-join).
-- Admin invites allow squad admins to insert rows with status = 'invited'.
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

-- ============================================================================
-- 6. Atomic Username Invite RPC Function
-- ============================================================================

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

  -- Verify caller is admin or creator of the squad
  select (public.is_squad_admin(p_squad_id, auth.uid())
          or exists (select 1 from public.squads where id = p_squad_id and created_by = auth.uid()))
  into v_is_admin;

  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'Only squad admins can invite members');
  end if;

  -- Clean and normalize username
  v_normalized := lower(regexp_replace(btrim(p_username), '^@', ''));
  if v_normalized = '' or v_normalized is null then
    return jsonb_build_object('ok', false, 'error', 'Invalid username');
  end if;

  -- Look up target user profile
  select id into v_target_id
  from public.profiles
  where username = v_normalized;

  if v_target_id is null then
    return jsonb_build_object('ok', false, 'error', 'User not found');
  end if;

  if v_target_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Cannot invite yourself');
  end if;

  -- Check existing membership or invite
  if exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id and user_id = v_target_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'User is already in this squad or has a pending invite');
  end if;

  -- Insert invite
  insert into public.squad_members (squad_id, user_id, role, status)
  values (p_squad_id, v_target_id, 'member', 'invited');

  return jsonb_build_object('ok', true, 'user_id', v_target_id);
end;
$$;

revoke all on function public.invite_to_squad_by_username(uuid, text) from public, anon;
grant execute on function public.invite_to_squad_by_username(uuid, text) to authenticated;

-- ============================================================================
-- 7. Board Name Removal & Profile Display Name Sync
-- ============================================================================

-- Trigger: keep public_pace.display_name in sync when profiles.display_name changes
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

-- Trigger: when a user opts into public_pace, pull display_name from profiles
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

-- Backfill existing rows in public_pace from profiles
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
-- 8. Realtime Publications (Friendships, Squad Members & Messages)
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
