-- Supabase Snippet Name: YouDO — Hashtag Room Members
-- The members list inside an exam hashtag room: who is in it, and for each one
-- whether you are friends, have asked, or can add them. Apply after
-- community_hashtags.sql, full_hub_rooms_setup.sql and profile_photos.sql.
-- Safe to re-run. Run the whole query in the SQL Editor (do not save it).
--
-- Only people on the Public Board are listed: the Board already shows each
-- member's exam hashtag to everyone signed in, so nothing new is exposed.
-- Banned members are left out. Only Board members can open the list.
-- admin_room_members (below) is the Admin Hub's view of the same room.

begin;

create or replace function public.community_room_members(room uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
declare result jsonb;
begin
  if me is null or not public.can_join_community(me) then
    raise exception 'Join the Public Board to see room members' using errcode = '42501';
  end if;
  if not exists (select 1 from public.community_hashtags h where h.id = room and h.active) then
    raise exception 'This exam hashtag is unavailable';
  end if;
  with members as (
    select
      hm.user_id,
      coalesce(nullif(pr.display_name, ''), nullif(pp.display_name, ''), 'Board member') as display_name,
      pr.username,
      pr.avatar_url,
      coalesce(pr.is_backer, false) as is_backer,
      pp.updated_at as active_at,
      (select f.id from public.friendships f
        where f.status = 'pending' and f.requester_id = hm.user_id and f.receiver_id = me) as incoming_request,
      case
        when hm.user_id = me then 'self'
        when exists (select 1 from public.friendships f where f.status = 'accepted'
          and ((f.requester_id = me and f.receiver_id = hm.user_id) or (f.requester_id = hm.user_id and f.receiver_id = me))) then 'friend'
        when exists (select 1 from public.friendships f where f.status = 'pending' and f.requester_id = me and f.receiver_id = hm.user_id) then 'requested'
        when exists (select 1 from public.friendships f where f.status = 'pending' and f.requester_id = hm.user_id and f.receiver_id = me) then 'incoming'
        when exists (select 1 from public.friendships f where f.status = 'blocked'
          and ((f.requester_id = me and f.receiver_id = hm.user_id) or (f.requester_id = hm.user_id and f.receiver_id = me))) then 'blocked'
        else 'none'
      end as relation
    from public.community_hashtag_memberships hm
    join public.public_pace pp on pp.user_id = hm.user_id
    left join public.profiles pr on pr.id = hm.user_id
    where hm.hashtag_id = room and not public.is_community_banned(hm.user_id)
  ), visible as (
    select * from members where relation <> 'blocked'
  )
  select pg_catalog.jsonb_build_object(
    'total', (select count(*) from visible),
    'members', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'user_id', v.user_id, 'display_name', v.display_name, 'username', v.username,
        'avatar_url', v.avatar_url, 'is_backer', v.is_backer, 'relation', v.relation,
        'request_id', case when v.relation = 'incoming' then v.incoming_request end)
      order by (v.relation = 'self') desc, (v.relation = 'friend') desc, v.active_at desc nulls last, v.display_name)
      from (select * from visible order by (relation = 'self') desc, (relation = 'friend') desc, active_at desc nulls last limit 300) v), '[]'::jsonb)
  ) into result;
  return result;
end; $$;
revoke execute on function public.community_room_members(uuid) from public, anon;
grant execute on function public.community_room_members(uuid) to authenticated;


-- Admin Hub → Hashtag rooms: everyone in a room for admins and the owner,
-- muted and banned people included (marked), so staff can open their card.
-- Staff don't need to be on the Board. Admins and the owner only.
create or replace function public.admin_room_members(room uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  if not exists (select 1 from public.community_hashtags h where h.id = room) then
    raise exception 'This exam hashtag is unavailable';
  end if;
  with members as (
    select
      hm.user_id,
      coalesce(nullif(pr.display_name, ''), nullif(pp.display_name, ''), nullif(cm.display_name, ''), 'Board member') as display_name,
      pr.username,
      pr.avatar_url,
      coalesce(pr.is_backer, false) as is_backer,
      a.role as staff_role,
      case when cm.muted_until > pg_catalog.now() then cm.muted_until end as muted_until,
      cm.banned_at,
      pp.user_id is not null as on_board,
      pp.updated_at as active_at
    from public.community_hashtag_memberships hm
    left join public.public_pace pp on pp.user_id = hm.user_id
    left join public.profiles pr on pr.id = hm.user_id
    left join public.community_members cm on cm.user_id = hm.user_id
    left join public.community_admins a on a.user_id = hm.user_id
    where hm.hashtag_id = room
  )
  select pg_catalog.jsonb_build_object(
    'total', (select count(*) from members),
    'muted', (select count(*) from members where muted_until is not null and banned_at is null),
    'banned', (select count(*) from members where banned_at is not null),
    'members', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'user_id', m.user_id, 'display_name', m.display_name, 'username', m.username,
        'avatar_url', m.avatar_url, 'is_backer', m.is_backer, 'staff_role', m.staff_role,
        'muted_until', m.muted_until, 'banned_at', m.banned_at, 'on_board', m.on_board)
      order by m.active_at desc nulls last, m.display_name)
      from (select * from members order by active_at desc nulls last limit 500) m), '[]'::jsonb)
  ) into result;
  return result;
end; $$;
revoke execute on function public.admin_room_members(uuid) from public, anon;
grant execute on function public.admin_room_members(uuid) to authenticated;

commit;
