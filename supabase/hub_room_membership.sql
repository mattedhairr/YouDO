-- ==============================================================================
-- YouDO — Private Hub room membership (accept, approve, join rules)
-- ==============================================================================
-- squad_members has no UPDATE policy, so accepting an invite or approving a
-- join request through a plain update changed 0 rows without an error: the
-- Accept buttons did nothing while Reject (a DELETE) worked. Accepting now goes
-- through two functions that check who may do it and that the room has space.
--
-- The INSERT policy also let a user add themselves to an open room with any
-- status and role (for example accepted admin). Joining is now: the creator
-- as admin of their own new room, anyone else as a pending request, and room
-- admins inviting members.
--
-- Apply after full_hub_rooms_setup.sql. Rerunnable.
-- ==============================================================================

begin;

drop policy if exists "Users can join squads" on public.squad_members;
create policy "Users can join squads" on public.squad_members for insert with check (
  -- The creator joins their own new room as its admin.
  (
    (select auth.uid()) = user_id and role = 'admin' and status = 'accepted'
    and exists (select 1 from public.squads s where s.id = squad_members.squad_id and s.created_by = (select auth.uid()))
  )
  -- Anyone else asks to join an open room; a room admin approves.
  or (
    (select auth.uid()) = user_id and role = 'member' and status = 'pending'
    and exists (
      select 1 from public.squads s
      where s.id = squad_members.squad_id
        and s.privacy in ('anyone_can_join', 'public')
        and s.allow_join_requests
        and s.created_by <> (select auth.uid())
    )
  )
  -- Room admins invite other members.
  or (
    role = 'member' and status = 'invited' and user_id <> (select auth.uid())
    and (
      public.is_squad_admin(squad_members.squad_id, (select auth.uid()))
      or exists (select 1 from public.squads s where s.id = squad_members.squad_id and s.created_by = (select auth.uid()))
    )
  )
);

-- A room holds 2, 3 or 4 members, chosen when it is created; rooms made before
-- the choice existed hold 4. The limit applies when someone joins.
alter table public.squads add column if not exists member_limit smallint not null default 4;
alter table public.squads drop constraint if exists squads_member_limit_check;
alter table public.squads add constraint squads_member_limit_check check (member_limit between 2 and 4);

create or replace function public.squad_has_room(target_squad uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.squad_members m where m.squad_id = target_squad and m.status = 'accepted')
    < (select s.member_limit from public.squads s where s.id = target_squad);
$$;
revoke execute on function public.squad_has_room(uuid) from public, anon, authenticated;

create or replace function public.accept_squad_invite(target_squad uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  -- One join at a time per room, so two accepts cannot both take the last place.
  perform 1 from public.squads where id = target_squad for update;
  if not exists (select 1 from public.squad_members where squad_id = target_squad and user_id = me and status = 'invited') then
    raise exception 'This invite is no longer available';
  end if;
  if not public.squad_has_room(target_squad) then raise exception 'This room is full'; end if;
  update public.squad_members set status = 'accepted', joined_at = pg_catalog.now()
    where squad_id = target_squad and user_id = me and status = 'invited';
end; $$;

revoke execute on function public.accept_squad_invite(uuid) from public, anon;
grant execute on function public.accept_squad_invite(uuid) to authenticated;

create or replace function public.approve_squad_join_request(target_squad uuid, requester uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if not (
    public.is_squad_admin(target_squad, me)
    or exists (select 1 from public.squads s where s.id = target_squad and s.created_by = me)
  ) then
    raise exception 'Only room admins can approve requests' using errcode = '42501';
  end if;
  perform 1 from public.squads where id = target_squad for update;
  if not exists (select 1 from public.squad_members where squad_id = target_squad and user_id = requester and status = 'pending') then
    raise exception 'This request is no longer waiting';
  end if;
  if not public.squad_has_room(target_squad) then raise exception 'This room is full'; end if;
  update public.squad_members set status = 'accepted', role = 'member', joined_at = pg_catalog.now()
    where squad_id = target_squad and user_id = requester and status = 'pending';
end; $$;

revoke execute on function public.approve_squad_join_request(uuid, uuid) from public, anon;
grant execute on function public.approve_squad_join_request(uuid, uuid) to authenticated;

-- Only the creator can delete a room; members, invites and messages go with it.
create or replace function public.delete_squad(target_squad uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  delete from public.squads where id = target_squad and created_by = auth.uid();
  if not found then raise exception 'Only the room creator can delete it' using errcode = '42501'; end if;
end; $$;

revoke execute on function public.delete_squad(uuid) from public, anon;
grant execute on function public.delete_squad(uuid) to authenticated;

commit;
