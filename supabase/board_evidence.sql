-- Apply after cloud_backup_revisions.sql, public_pace.sql, community.sql,
-- and community_hashtags.sql. Public totals are derived from the revisioned
-- private cloud copy; direct client writes to legacy total columns are ignored.
begin;

create table if not exists public.board_focus_sessions (
  user_id uuid not null references public.public_pace(user_id) on delete cascade,
  session_id text not null,
  start_ms bigint not null,
  end_ms bigint not null,
  net_ms bigint not null,
  pauses jsonb not null default '[]'::jsonb,
  ledger_complete boolean not null default false,
  backup_revision bigint not null,
  primary key (user_id, session_id),
  constraint board_focus_session_bounds check (
    start_ms < end_ms and net_ms >= 15000 and net_ms <= end_ms - start_ms
    and end_ms - start_ms <= 604800000
  )
);
create index if not exists board_focus_sessions_window
  on public.board_focus_sessions (start_ms, end_ms, user_id);
alter table public.board_focus_sessions enable row level security;
revoke all on public.board_focus_sessions from public, anon, authenticated;

create table if not exists public.board_evidence_state (
  user_id uuid primary key references public.public_pace(user_id) on delete cascade,
  backup_revision bigint not null,
  reconciled_at timestamptz not null default clock_timestamp(),
  accepted integer not null,
  rejected integer not null
);
alter table public.board_evidence_state enable row level security;
revoke all on public.board_evidence_state from public, anon, authenticated;

-- Old clients may still upload totals. Keep their profile writes working. Old
-- stored values remain untouched, but clients can no longer change those
-- numerical columns and neither the Board nor kudos reads them.
create or replace function public.ignore_uploaded_board_totals()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if TG_OP = 'INSERT' then
    new.today_ms := 0;
    new.week_ms := 0;
    new.month_ms := 0;
    new.today_key := null;
    new.week_key := null;
    new.month_key := null;
    new.streak := 0;
  else
    new.today_ms := old.today_ms;
    new.week_ms := old.week_ms;
    new.month_ms := old.month_ms;
    new.today_key := old.today_key;
    new.week_key := old.week_key;
    new.month_key := old.month_key;
    new.streak := old.streak;
  end if;
  new.bar_hours := least(10::numeric, greatest(0.5::numeric, coalesce(new.bar_hours, 1::numeric)));
  new.updated_at := clock_timestamp();
  return new;
end;
$function$;
drop trigger if exists ignore_uploaded_board_totals on public.public_pace;
create trigger ignore_uploaded_board_totals before insert or update on public.public_pace
  for each row execute function public.ignore_uploaded_board_totals();
revoke execute on function public.ignore_uploaded_board_totals() from public, anon, authenticated;

-- Reconcile only the caller's current backup. A private backup write succeeds
-- independently; malformed evidence can delay public ranking, never erase it.
create or replace function public.reconcile_board_evidence()
returns table(status text, accepted integer, rejected integer, backup_revision bigint)
language plpgsql security definer set search_path = '' as $function$
declare
  owner_id uuid := auth.uid();
  backup_text text;
  rev bigint;
  payload jsonb;
  history jsonb;
  item jsonb;
  sid text;
  start_value bigint;
  end_value bigint;
  net_value bigint;
  elapsed bigint;
  pause_value bigint;
  pause_item jsonb;
  pause_start bigint;
  pause_end bigint;
  pause_until bigint;
  documented_pause bigint;
  complete_ledger boolean;
  prior_end bigint := 0;
  good integer := 0;
  bad integer := 0;
  row_count integer;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.public_pace p where p.user_id = owner_id) then
    return query select 'not_joined'::text, 0, 0, null::bigint; return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 889));
  select b.backup_data, b.revision into backup_text, rev
    from public.user_backups b where b.user_id = owner_id for share;
  if rev is null then
    return query select 'waiting_for_sync'::text, 0, 0, null::bigint; return;
  end if;
  if pg_catalog.octet_length(backup_text) > 4194304 then
    return query select 'too_large'::text, 0, 0, rev; return;
  end if;
  if exists (select 1 from public.board_evidence_state e
      where e.user_id = owner_id and e.backup_revision = rev) then
    return query select 'current'::text, e.accepted, e.rejected, rev
      from public.board_evidence_state e where e.user_id = owner_id; return;
  end if;
  begin
    payload := backup_text::jsonb;
  exception when others then
    return query select 'invalid_backup'::text, 0, 0, rev; return;
  end;
  history := payload -> 'sessionHistory';
  if history is null then history := '{}'::jsonb; end if;
  if pg_catalog.jsonb_typeof(history) <> 'object' then
    return query select 'invalid_backup'::text, 0, 0, rev; return;
  end if;
  select count(*) into row_count from pg_catalog.jsonb_each(history) h,
    lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(h.value) = 'array' then h.value else '[]'::jsonb end
    ) s;
  if row_count > 5000 then
    return query select 'too_many_sessions'::text, 0, row_count, rev; return;
  end if;

  delete from public.board_focus_sessions f where f.user_id = owner_id;
  for item in
    select s.value from pg_catalog.jsonb_each(history) h,
      lateral pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(h.value) = 'array' then h.value else '[]'::jsonb end
      ) s
    order by case when s.value->>'startTime' ~ '^[0-9]{12,13}$'
      then (s.value->>'startTime')::numeric else null end nulls last
  loop
    if pg_catalog.jsonb_typeof(item) <> 'object'
      or coalesce(item->>'manual', 'false') = 'true'
      or coalesce(item->>'id', '') = ''
      or pg_catalog.length(item->>'id') > 200
      or coalesce(item->>'startTime', '') !~ '^[0-9]{12,13}$'
      or coalesce(item->>'endTime', '') !~ '^[0-9]{12,13}$'
      or coalesce(item->>'netFocusMs', '') !~ '^[0-9]{1,9}$' then
      bad := bad + 1; continue;
    end if;
    sid := item->>'id';
    start_value := (item->>'startTime')::bigint;
    end_value := (item->>'endTime')::bigint;
    net_value := (item->>'netFocusMs')::bigint;
    elapsed := end_value - start_value;
    if start_value < (extract(epoch from clock_timestamp() - interval '100 days') * 1000)::bigint
      or end_value > (extract(epoch from clock_timestamp() + interval '5 minutes') * 1000)::bigint
      or elapsed <= 0 or elapsed > 604800000 or net_value < 15000 or net_value > elapsed
      or start_value < prior_end
      or exists (select 1 from public.board_focus_sessions f
        where f.user_id = owner_id and f.session_id = sid) then
      bad := bad + 1; continue;
    end if;

    complete_ledger := true;
    documented_pause := 0;
    pause_until := start_value;
    if pg_catalog.jsonb_typeof(item->'pauses') = 'array' then
      for pause_item in select value from pg_catalog.jsonb_array_elements(item->'pauses') loop
        if coalesce(pause_item->>'start', '') !~ '^[0-9]{12,13}$'
          or coalesce(pause_item->>'end', '') !~ '^[0-9]{12,13}$' then
          complete_ledger := false; exit;
        end if;
        pause_start := (pause_item->>'start')::bigint;
        pause_end := (pause_item->>'end')::bigint;
        if pause_start < pause_until or pause_end > end_value or pause_end <= pause_start then
          complete_ledger := false; exit;
        end if;
        documented_pause := documented_pause + pause_end - pause_start;
        pause_until := pause_end;
      end loop;
    else
      complete_ledger := false;
    end if;
    if pg_catalog.abs(elapsed - documented_pause - net_value) > 1000 then
      complete_ledger := false;
    end if;
    insert into public.board_focus_sessions
      (user_id, session_id, start_ms, end_ms, net_ms, pauses, ledger_complete, backup_revision)
    values (owner_id, sid, start_value, end_value, net_value,
      case when complete_ledger then item->'pauses' else '[]'::jsonb end,
      complete_ledger, rev);
    good := good + 1;
    prior_end := end_value;
  end loop;
  insert into public.board_evidence_state (user_id, backup_revision, accepted, rejected)
    values (owner_id, rev, good, bad)
    on conflict (user_id) do update set backup_revision = excluded.backup_revision,
      accepted = excluded.accepted, rejected = excluded.rejected,
      reconciled_at = clock_timestamp();
  return query select 'current'::text, good, bad, rev;
end;
$function$;
revoke execute on function public.reconcile_board_evidence() from public, anon;
grant execute on function public.reconcile_board_evidence() to authenticated;

-- Split each sitting at the viewer's local midnight. A complete pause ledger
-- subtracts actual pause intervals; older histories without one distribute
-- the reported net time over their elapsed interval.
create or replace function public.board_focus_days(board_timezone text)
returns table(user_id uuid, day_key date, focus_ms bigint)
language sql stable security definer set search_path = '' as $function$
  with fresh as (
    select f.* from public.board_focus_sessions f
    join public.board_evidence_state e on e.user_id = f.user_id
      and e.backup_revision = f.backup_revision
    join public.user_backups b on b.user_id = e.user_id
      and b.revision = e.backup_revision
    where auth.uid() is not null
  ), slices as (
    select f.user_id, f.net_ms, f.start_ms, f.end_ms, f.pauses,
      f.ledger_complete, d.day::date as day_key,
      greatest(f.start_ms, (extract(epoch from (d.day at time zone board_timezone)) * 1000)::bigint) as slice_start,
      least(f.end_ms, (extract(epoch from ((d.day + interval '1 day') at time zone board_timezone)) * 1000)::bigint) as slice_end
    from fresh f
    cross join lateral pg_catalog.generate_series(
      (pg_catalog.to_timestamp(f.start_ms / 1000.0) at time zone board_timezone)::date::timestamp,
      (pg_catalog.to_timestamp((f.end_ms - 1) / 1000.0) at time zone board_timezone)::date::timestamp,
      interval '1 day'
    ) d(day)
  ), parts as (
    select s.user_id, s.day_key,
      case when s.ledger_complete then
        greatest(0, s.slice_end - s.slice_start - coalesce(p.paused_ms, 0))::bigint
      else
        (pg_catalog.round(s.net_ms::numeric * (s.slice_end - s.start_ms) / (s.end_ms - s.start_ms))
          - pg_catalog.round(s.net_ms::numeric * (s.slice_start - s.start_ms) / (s.end_ms - s.start_ms)))::bigint
      end as slice_ms
    from slices s
    cross join lateral (
      select sum(greatest(0,
        least(s.slice_end, (pause.value->>'end')::bigint)
        - greatest(s.slice_start, (pause.value->>'start')::bigint)))::bigint as paused_ms
      from pg_catalog.jsonb_array_elements(s.pauses) pause
    ) p
    where s.slice_end > s.slice_start
  )
  select p.user_id, p.day_key, sum(p.slice_ms)::bigint
  from parts p group by p.user_id, p.day_key;
$function$;
revoke execute on function public.board_focus_days(text) from public, anon, authenticated;

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

-- Preserve the old RPC shape for older clients, but never return uploaded totals.
create or replace function public.board_pace_rows()
returns table(
  user_id uuid, display_name text, exam_label text, hashtag_id uuid, hashtag_label text,
  today_ms bigint, week_ms bigint, month_ms bigint, today_key date, week_key date,
  month_key date, streak integer, bar_hours numeric, updated_at timestamptz
) language sql stable security definer set search_path = '' as $function$
  select * from public.board_pace_rows('UTC');
$function$;
revoke execute on function public.board_pace_rows() from public, anon;
grant execute on function public.board_pace_rows() to authenticated;

-- Kudos eligibility uses the same derived windows shown on the Board.
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
    select p.user_id, case board_window when 'today' then p.today_ms
      when 'week' then p.week_ms else p.month_ms end as focus,
      greatest(1::numeric, p.bar_hours * case board_window
        when 'today' then 1 when 'week' then 7
        else extract(day from (date_trunc('month', anchor::timestamp) + interval '1 month - 1 day'))
      end * 3600000) as bar_target
    from public.board_pace_rows(board_timezone) p
    where not public.is_community_banned(p.user_id) and btrim(p.display_name) <> ''
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
