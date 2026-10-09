-- Supabase Snippet Name: YouDO — Fallback / Rollback: Rooms Privacy, Username Invites & Board Name Removal
-- File: supabase/rollback_rooms_privacy_and_invites.sql
-- Description: Cleanly reverts all changes introduced by rooms_privacy_and_invites.sql
-- Idempotent and safe to run in Supabase SQL Editor if experiment needs to be cleanly undone.

begin;

-- ============================================================================
-- 1. Squads Table Rollback (Privacy Column & Bar Hours)
-- ============================================================================

-- Backfill any null bar_hours to 4 (original default) before restoring NOT NULL
update public.squads
set bar_hours = 4
where bar_hours is null;

alter table public.squads alter column bar_hours set default 4;
alter table public.squads alter column bar_hours set not null;

-- Remove privacy column
alter table public.squads drop column if exists privacy;

-- ============================================================================
-- 2. Helper Security Definer Functions Rollback
-- ============================================================================

drop function if exists public.is_squad_member_or_invited(uuid, uuid);

-- ============================================================================
-- 3. Squads RLS Policies Rollback
-- ============================================================================

-- Restore member-only / creator visibility
drop policy if exists "Users view squads they are in" on public.squads;
create policy "Users view squads they are in" on public.squads for select using (
  auth.uid() = created_by
  or public.is_accepted_squad_member(squads.id, auth.uid())
);

drop policy if exists "Squad admins update squads" on public.squads;
create policy "Squad admins update squads" on public.squads for update using (
  auth.uid() = created_by
  or public.is_squad_admin(squads.id, auth.uid())
);

-- ============================================================================
-- 4. Discover Squads Function Rollback
-- ============================================================================

-- Restore original discovery logic (filtering only on allow_join_requests)
create or replace function public.discover_squads()
returns setof public.squads
language sql
security definer
stable
set search_path = public
as $$
  select s.*
  from public.squads s
  where s.allow_join_requests = true
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
-- 5. Squad Members RLS Insert Policy Rollback
-- ============================================================================

-- Restore original self-join only policy
drop policy if exists "Users can join squads" on public.squad_members;
create policy "Users can join squads" on public.squad_members for insert with check (
  auth.uid() = user_id
);

-- ============================================================================
-- 6. Atomic Username Invite RPC Function Rollback
-- ============================================================================

drop function if exists public.invite_to_squad_by_username(uuid, text);

-- ============================================================================
-- 7. Board Name & Display Name Sync Rollback
-- ============================================================================

-- Remove triggers syncing profile display_name to public_pace
drop trigger if exists trg_sync_profile_name_to_public_pace on public.profiles;
drop function if exists public.sync_profile_name_to_public_pace();

drop trigger if exists trg_sync_public_pace_name_from_profile on public.public_pace;
drop function if exists public.sync_public_pace_name_from_profile();

-- Restore original board_pace_rows(board_timezone text) reading display_name directly from public_pace
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

commit;
