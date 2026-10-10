-- Supabase Snippet Name: YouDO — Complete Private Hub & Rooms Rollback (Back to Main)
-- File: supabase/full_hub_rooms_rollback.sql
-- Description: Completely undoes full_hub_rooms_setup.sql, returning Supabase 100% back to main.
-- Idempotent and safe to run in Supabase SQL Editor.

begin;

-- ============================================================================
-- 1. Remove Triggers on Core Tables
-- ============================================================================
drop trigger if exists trg_sync_public_pace_name_from_profile on public.public_pace;
drop function if exists public.sync_public_pace_name_from_profile() cascade;

-- Restore original prune_community_history from main (prunes only community_messages & appreciations)
create or replace function public.prune_community_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.community_messages cm where expires_at < now() - interval '7 days'
    and not exists (select 1 from public.community_reports r where r.message_id = cm.id and r.status = 'open');
  delete from public.board_appreciations where day_key < (now() at time zone 'UTC')::date - 31;
  return null;
end; $$;

-- Restore original board_pace_rows(board_timezone text) from main
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
    select p.user_id, p.display_name, p.exam_label, h.id, h.label,
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
    left join totals t on t.user_id = p.user_id
    left join public.community_hashtag_memberships hm on hm.user_id = p.user_id
    left join public.community_hashtags h on h.id = hm.hashtag_id and h.active;
end;
$function$;

revoke execute on function public.board_pace_rows(text) from public, anon;
grant execute on function public.board_pace_rows(text) to authenticated;

-- ============================================================================
-- 2. Drop Tables with CASCADE (Drops all member tables, DM tables, & RLS policies)
-- ============================================================================
drop table if exists public.squad_messages cascade;
drop table if exists public.direct_messages cascade;
drop table if exists public.squad_members cascade;
drop table if exists public.squads cascade;
drop table if exists public.friendships cascade;
drop table if exists public.profiles cascade;

-- ============================================================================
-- 3. Drop Helper Functions (After dependent tables/policies are dropped)
-- ============================================================================
drop function if exists public.invite_to_squad_by_username(uuid, text) cascade;
drop function if exists public.discover_squads() cascade;
drop function if exists public.is_squad_member_or_invited(uuid, uuid) cascade;
drop function if exists public.is_squad_admin(uuid, uuid) cascade;
drop function if exists public.is_accepted_squad_member(uuid, uuid) cascade;
drop function if exists public.sync_profile_name_to_public_pace() cascade;

-- ============================================================================
-- 4. Remove Realtime Publications
-- ============================================================================
do $$
begin
  alter publication supabase_realtime drop table public.squad_messages;
exception
  when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime drop table public.squad_members;
exception
  when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime drop table public.friendships;
exception
  when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime drop table public.direct_messages;
exception
  when others then null;
end $$;

-- ============================================================================
-- 5. Strip Stale 'username' from auth.users raw_user_meta_data
-- ============================================================================
update auth.users
set raw_user_meta_data = raw_user_meta_data - 'username'
where raw_user_meta_data ? 'username';

commit;
