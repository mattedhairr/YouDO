-- Apply after board_evidence.sql while installed clients still use the
-- zero-argument Board RPC and upload legacy totals. Re-run board_evidence.sql
-- at public release cutover, after compatible clients have been distributed.
-- The timezone-aware Board RPC remains evidence-derived for candidate tests.
begin;

drop trigger if exists ignore_uploaded_board_totals on public.public_pace;

create or replace function public.board_pace_rows()
returns table(
  user_id uuid, display_name text, exam_label text, hashtag_id uuid, hashtag_label text,
  today_ms bigint, week_ms bigint, month_ms bigint, today_key date, week_key date,
  month_key date, streak integer, bar_hours numeric, updated_at timestamptz
) language plpgsql stable security definer set search_path = '' as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return query
    select p.user_id, p.display_name, p.exam_label, h.id, h.label,
      p.today_ms, p.week_ms, p.month_ms, p.today_key, p.week_key, p.month_key,
      p.streak, p.bar_hours, p.updated_at
    from public.public_pace p
    left join public.community_hashtag_memberships m on m.user_id = p.user_id
    left join public.community_hashtags h on h.id = m.hashtag_id and h.active;
end;
$function$;
revoke execute on function public.board_pace_rows() from public, anon;
grant execute on function public.board_pace_rows() to authenticated;

-- Older clients should keep the same kudos eligibility as their Board view.
create or replace function public.give_board_kudos(target uuid, board_window text, board_timezone text default 'UTC')
returns void language plpgsql security definer set search_path = '' as $function$
declare anchor date;
declare eligible boolean;
declare inserted_count integer;
declare sender_name text;
declare target_name text;
begin
  if auth.uid() is null or target = auth.uid() or not public.can_join_community()
    or not public.can_join_community(target) then
    raise exception 'Board membership required' using errcode = '42501';
  end if;
  if board_window not in ('today', 'week', 'month') or board_window is null then
    raise exception 'Invalid Board period';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = board_timezone) then
    raise exception 'Invalid timezone';
  end if;
  anchor := (now() at time zone board_timezone)::date;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  if not coalesce((select appreciations_enabled from public.community_settings where id = 1), false)
    or exists (select 1 from public.community_members where user_id = auth.uid() and muted_until > now()) then
    raise exception 'Kudos is paused' using errcode = '42501';
  end if;
  with eligible_members as (
    select p.user_id, case board_window
      when 'today' then case when coalesce(p.today_key, (p.updated_at at time zone board_timezone)::date) = anchor then p.today_ms else 0 end
      when 'week' then case when coalesce(p.week_key, date_trunc('week', p.updated_at at time zone board_timezone)::date) = date_trunc('week', anchor::timestamp)::date then p.week_ms else 0 end
      else case when coalesce(p.month_key, date_trunc('month', p.updated_at at time zone board_timezone)::date) = date_trunc('month', anchor::timestamp)::date then p.month_ms else 0 end end as focus,
      greatest(1::numeric, p.bar_hours * case board_window
        when 'today' then 1 when 'week' then 7
        else extract(day from (date_trunc('month', anchor::timestamp) + interval '1 month - 1 day'))
      end * 3600000) as bar_target
    from public.public_pace p where not public.is_community_banned(p.user_id) and btrim(p.display_name) <> ''
  ), leaders as (
    select user_id, focus, bar_target from eligible_members
    where focus > 0 order by focus desc, user_id limit 3
  )
  select (select count(*) from eligible_members) >= 10
    and exists (select 1 from leaders where user_id = target and focus >= bar_target)
    into eligible;
  if not eligible then
    raise exception 'Kudos unlocks only for a top-three member who reached their focus bar.';
  end if;
  if (select count(*) from public.board_appreciations
      where from_user = auth.uid() and day_key = public.community_today()) >= 12 then
    raise exception 'Daily acknowledgement limit reached';
  end if;
  insert into public.board_appreciations(day_key, from_user, to_user)
    values (public.community_today(), auth.uid(), target)
    on conflict (day_key, from_user, to_user) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 1 and coalesce((select room_enabled from public.community_settings where id = 1), false) then
    select left(display_name, 40) into sender_name from public.public_pace where user_id = auth.uid();
    select left(display_name, 40) into target_name from public.public_pace where user_id = target;
    insert into public.community_messages(author_id, body, message_kind)
      values (auth.uid(), sender_name || ' gave ' || target_name || ' kudos · '
        || case board_window when 'today' then 'today'
          when 'week' then 'this week' else 'this month' end, 'kudos');
  end if;
end;
$function$;
revoke execute on function public.give_board_kudos(uuid, text, text) from public, anon;
grant execute on function public.give_board_kudos(uuid, text, text) to authenticated;

commit;
