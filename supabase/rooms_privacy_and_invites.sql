-- Supabase Snippet Name: YouDO — Rooms Privacy, Username Invites & Board Name Removal
-- File: supabase/rooms_privacy_and_invites.sql
-- Milestone 1 (R1) Database Schema & Supabase Migrations
-- Applies on top of existing squads schema idempotently.
-- Safe to run multiple times.

begin;

-- ============================================================================
-- 1. Squads Table Alterations (Privacy & Bar Hours)
-- ============================================================================

-- Ensure privacy column exists with canonical default 'anyone_can_join'
alter table public.squads
  add column if not exists privacy text not null default 'anyone_can_join';

-- Permanently and idempotently enforce check constraint supporting both
-- canonical ('anyone_can_join', 'invite_only') and legacy ('public', 'private') values
alter table public.squads drop constraint if exists squads_privacy_check;
alter table public.squads add constraint squads_privacy_check
  check (privacy in ('anyone_can_join', 'invite_only', 'public', 'private'));

-- Ensure allow_join_requests exists
alter table public.squads
  add column if not exists allow_join_requests boolean not null default true;

-- Make bar_hours nullable and default to null so room pace is optional
alter table public.squads alter column bar_hours drop not null;
alter table public.squads alter column bar_hours set default null;

-- Sync privacy for any legacy squads where allow_join_requests was false
update public.squads
set privacy = 'invite_only'
where allow_join_requests = false and privacy in ('anyone_can_join', 'public');

-- Normalize any null privacy values to canonical default
update public.squads
set privacy = case
  when privacy = 'public' then 'anyone_can_join'
  when privacy = 'private' then 'invite_only'
  when privacy is null and allow_join_requests = false then 'invite_only'
  when privacy is null then 'anyone_can_join'
  else privacy
end
where privacy is null;

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

-- Check if user is an accepted member of a squad
create or replace function public.is_accepted_squad_member(p_squad_id uuid, p_user_id uuid)
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
      and status = 'accepted'
  );
$$;

revoke all on function public.is_accepted_squad_member(uuid, uuid) from public, anon;
grant execute on function public.is_accepted_squad_member(uuid, uuid) to authenticated;

-- Check if user is an admin of a squad
create or replace function public.is_squad_admin(p_squad_id uuid, p_user_id uuid)
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
      and role = 'admin'
      and status = 'accepted'
  );
$$;

revoke all on function public.is_squad_admin(uuid, uuid) from public, anon;
grant execute on function public.is_squad_admin(uuid, uuid) to authenticated;

-- ============================================================================
-- 3. Squads & Squad Members RLS Policies
-- ============================================================================

drop policy if exists "Users view squads they are in" on public.squads;
create policy "Users view squads they are in" on public.squads for select using (
  auth.uid() = created_by
  or privacy in ('anyone_can_join', 'public')
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
        and (s.privacy in ('anyone_can_join', 'public') or s.created_by = auth.uid())
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
-- 4. RPC Functions (Discover & Username Invites)
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
  where s.privacy in ('anyone_can_join', 'public')
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

commit;
