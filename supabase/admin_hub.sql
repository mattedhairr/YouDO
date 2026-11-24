-- Admin Hub: people, staff, growth and account cleanup, all from the app.
-- Safe to re-run. Apply after every file in scripts/supabase-setup-order.mjs
-- that comes before it (it reads their tables).
--
-- Who may do what (the app shows the same, but this file is what enforces it):
-- - Admins and the owner: look people up by name or @username and see their
--   community side (joined, last active, Board, rooms, messages, warnings).
-- - The owner only: emails and sign-in details, saved-data size, making and
--   removing admins, growth numbers, and deleting accounts. Ownership itself
--   is never changed here: only supabase/operations/manage_community_staff.sql.
-- Deleting goes through the owner-delete-accounts edge function, which asks
-- owner_accounts_to_delete() (as the owner) for the ids and then uses Supabase
-- Auth's own delete, so every table that cascades from auth.users is cleared.

-- The caller's own role: 'owner', 'admin' or null. Never anyone else's.
create or replace function public.admin_hub_role()
returns text language sql stable security definer set search_path = '' as $$
  select a.role from public.community_admins a where a.user_id = auth.uid();
$$;

-- Every account's newest server-side sign of life, and what it has saved.
-- Internal: not callable from the app.
create or replace function public.admin_account_facts()
returns table(
  user_id uuid, email text, created_at timestamptz, email_confirmed_at timestamptz, last_sign_in_at timestamptz,
  username text, display_name text, backup_bytes bigint, backup_updated_at timestamptz,
  on_board boolean, board_week_ms bigint, room_count integer, friend_count integer,
  message_count integer, direct_message_count integer, reported_count integer,
  staff_role text, badge_visible boolean, is_backer boolean,
  muted_until timestamptz, banned_at timestamptz, moderation_note text,
  hashtag text, last_active_at timestamptz, junk text
) language sql stable security definer set search_path = '' as $$
  select x.*, case
    when x.staff_role is not null or x.is_backer then null
    when x.email_confirmed_at is null and x.created_at < pg_catalog.now() - interval '7 days' then 'unconfirmed'
    when x.email_confirmed_at is not null
      and coalesce(x.backup_bytes, 0) <= 1024 and not x.on_board
      and x.room_count = 0 and x.friend_count = 0 and x.message_count = 0 and x.direct_message_count = 0
      and coalesce(x.last_active_at, x.created_at) < pg_catalog.now() - interval '60 days'
      and x.created_at < pg_catalog.now() - interval '60 days' then 'empty'
  end from (
  select
    u.id as user_id, u.email::text as email, u.created_at, u.email_confirmed_at, u.last_sign_in_at,
    p.username, coalesce(nullif(p.display_name, ''), nullif(pp.display_name, ''), nullif(cm.display_name, '')) as display_name,
    pg_catalog.octet_length(b.backup_data)::bigint as backup_bytes, b.updated_at as backup_updated_at,
    pp.user_id is not null as on_board, coalesce(pp.week_ms, 0) as board_week_ms,
    (select count(*)::int from public.squad_members sm where sm.user_id = u.id and sm.status = 'accepted') as room_count,
    (select count(*)::int from public.friendships f where (f.requester_id = u.id or f.receiver_id = u.id) and f.status = 'accepted') as friend_count,
    (select count(*)::int from public.community_messages m where m.author_id = u.id) as message_count,
    (select count(*)::int from public.direct_messages d where d.sender_id = u.id) as direct_message_count,
    (select count(distinct r.message_id)::int from public.community_reports r
       join public.community_messages m on m.id = r.message_id where m.author_id = u.id) as reported_count,
    a.role as staff_role, coalesce(a.badge_visible, false) as badge_visible,
    exists (select 1 from public.hub_backers hb where hb.user_id = u.id) as is_backer,
    cm.muted_until, cm.banned_at, coalesce(cm.moderation_note, '') as moderation_note,
    (select h.label from public.community_hashtag_memberships hm
       join public.community_hashtags h on h.id = hm.hashtag_id where hm.user_id = u.id) as hashtag,
    greatest(
      u.last_sign_in_at, b.updated_at, pp.updated_at, ca.last_seen_at, fs.updated_at,
      (select max(s.created_at) from public.user_backup_snapshots s where s.user_id = u.id),
      (select max(m.created_at) from public.community_messages m where m.author_id = u.id),
      (select max(d.created_at) from public.direct_messages d where d.sender_id = u.id)
    ) as last_active_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_backups b on b.user_id = u.id
  left join public.public_pace pp on pp.user_id = u.id
  left join public.community_activity ca on ca.user_id = u.id
  left join public.focus_status fs on fs.user_id = u.id
  left join public.community_admins a on a.user_id = u.id
  left join public.community_members cm on cm.user_id = u.id
  ) x;
$$;

-- A person as the caller may see them: admins never get the owner-only keys.
create or replace function public.admin_person_view(person jsonb, as_owner boolean)
returns jsonb language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_strip_nulls(case when as_owner then person
    else person - array['email', 'email_confirmed_at', 'last_sign_in_at', 'backup_bytes', 'backup_updated_at', 'junk',
      'is_backer', 'friend_count', 'direct_message_count'] end);
$$;

-- People: search and filter. Admins see people who have a name in YouDO (a
-- Private Hub profile, the Board or community chat) and search by name only.
create or replace function public.admin_people(
  search text default '', people_filter text default 'all', page_size integer default 40, page_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner_view boolean := public.is_community_owner();
declare needle text := pg_catalog.lower(pg_catalog.btrim(coalesce(search, '')));
declare chosen text := coalesce(nullif(people_filter, ''), 'all');
declare result jsonb;
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  if chosen not in ('all', 'staff', 'muted', 'banned', 'never_started', 'junk') then raise exception 'Unknown filter'; end if;
  if chosen in ('never_started', 'junk') and not owner_view then raise exception 'Owner required' using errcode = '42501'; end if;
  needle := pg_catalog.ltrim(needle, '@');
  with facts as (
    select f.* from public.admin_account_facts() f
  ), visible as (
    select * from facts f
    where (owner_view or f.display_name is not null or f.username is not null)
      and (needle = ''
        or pg_catalog.lower(coalesce(f.username, '')) like '%' || needle || '%'
        or pg_catalog.lower(coalesce(f.display_name, '')) like '%' || needle || '%'
        or (owner_view and pg_catalog.lower(coalesce(f.email, '')) like '%' || needle || '%'))
      and case chosen
        when 'staff' then f.staff_role is not null
        when 'muted' then f.muted_until > pg_catalog.now()
        when 'banned' then f.banned_at is not null
        when 'never_started' then coalesce(f.backup_bytes, 0) <= 1024 and not f.on_board and f.room_count = 0 and f.message_count = 0
        when 'junk' then f.junk is not null
        else true end
  ), counted as (
    select (select count(*) from visible) as total,
      (select count(*) from facts f where owner_view or f.display_name is not null or f.username is not null) as everyone,
      (select count(*) from facts f where f.staff_role is not null) as staff,
      (select count(*) from facts f where f.muted_until > pg_catalog.now()) as muted,
      (select count(*) from facts f where f.banned_at is not null) as banned
  ), page as (
    select v.* from visible v
    order by (v.staff_role = 'owner') desc nulls last, v.last_active_at desc nulls last, v.created_at desc
    limit least(greatest(coalesce(page_size, 40), 1), 100) offset greatest(coalesce(page_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', c.total,
    'counts', jsonb_build_object('all', c.everyone, 'staff', c.staff, 'muted', c.muted, 'banned', c.banned),
    'people', coalesce((select jsonb_agg(public.admin_person_view(to_jsonb(p), owner_view)) from page p), '[]'::jsonb)
  ) into result from counted c;
  return result;
end; $$;

create or replace function public.admin_person(target uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner_view boolean := public.is_community_owner();
declare found_person jsonb;
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  select public.admin_person_view(to_jsonb(f), owner_view) into found_person
  from public.admin_account_facts() f
  where f.user_id = target and (owner_view or f.display_name is not null or f.username is not null);
  if found_person is null then raise exception 'Person not found'; end if;
  return found_person;
end; $$;

-- Make or remove an admin, or show or hide their badge. The owner only, and
-- never on the owner.
create or replace function public.owner_set_staff(target uuid, staff_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_role text;
declare clean_action text := pg_catalog.lower(pg_catalog.btrim(coalesce(staff_action, '')));
begin
  if not public.is_community_owner() then raise exception 'Owner required' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users where id = target) then raise exception 'Person not found'; end if;
  select role into target_role from public.community_admins where user_id = target;
  if target_role = 'owner' then raise exception 'The owner''s role is changed only in Supabase' using errcode = '42501'; end if;
  if clean_action = 'promote' then
    insert into public.community_admins(user_id, role, badge_visible) values (target, 'admin', true)
      on conflict (user_id) do nothing;
    -- An admin is never muted or banned.
    update public.community_members set muted_until = null, banned_at = null, updated_by = auth.uid(), updated_at = pg_catalog.now()
      where user_id = target and (muted_until is not null or banned_at is not null);
  elsif clean_action = 'demote' then
    delete from public.community_admins where user_id = target and role = 'admin';
  elsif clean_action in ('show_badge', 'hide_badge') then
    if target_role is null then raise exception 'Not an admin'; end if;
    update public.community_admins set badge_visible = (clean_action = 'show_badge') where user_id = target;
  else
    raise exception 'Unknown staff action';
  end if;
  insert into public.community_audit_log(admin_id, action, target_user_id) values (auth.uid(), 'staff.' || clean_action, target);
  return public.admin_person(target);
end; $$;

-- Growth: counts only, no emails or ids. The owner only.
create or replace function public.owner_growth_report(weeks integer default 12)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare span integer := least(greatest(coalesce(weeks, 12), 4), 52);
declare result jsonb;
begin
  if not public.is_community_owner() then raise exception 'Owner required' using errcode = '42501'; end if;
  with facts as (
    select f.*,
      (coalesce(f.backup_bytes, 0) > 1024 or f.on_board or f.room_count > 0 or f.message_count > 0) as started,
      (f.last_active_at > f.created_at + interval '1 day') as came_back
    from public.admin_account_facts() f
  ), weeks_list as (
    select pg_catalog.generate_series(
      pg_catalog.date_trunc('week', pg_catalog.now()) - ((span - 1) * interval '1 week'),
      pg_catalog.date_trunc('week', pg_catalog.now()), interval '1 week') as week_start
  ), cohorts as (
    select w.week_start,
      count(f.user_id) as signups,
      count(f.user_id) filter (where f.email_confirmed_at is not null) as confirmed,
      count(f.user_id) filter (where f.started) as started,
      count(f.user_id) filter (where f.started and f.came_back) as came_back,
      count(f.user_id) filter (where f.last_active_at >= pg_catalog.now() - interval '7 days') as active_7d
    from weeks_list w
    left join facts f on f.created_at >= w.week_start and f.created_at < w.week_start + interval '1 week'
    group by w.week_start
  )
  select jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'accounts', (select count(*) from facts),
    'confirmed', (select count(*) from facts where email_confirmed_at is not null),
    'started', (select count(*) from facts where started),
    'came_back', (select count(*) from facts where started and came_back),
    'active_7d', (select count(*) from facts where last_active_at >= pg_catalog.now() - interval '7 days'),
    'active_30d', (select count(*) from facts where last_active_at >= pg_catalog.now() - interval '30 days'),
    'new_7d', (select count(*) from facts where created_at >= pg_catalog.now() - interval '7 days'),
    'new_7d_confirmed', (select count(*) from facts where created_at >= pg_catalog.now() - interval '7 days' and email_confirmed_at is not null),
    'studying_now', (select count(*) from public.focus_status s where s.state = 'focusing' and s.updated_at >= pg_catalog.now() - interval '12 hours'),
    'weeks', (select jsonb_agg(jsonb_build_object('week', c.week_start::date, 'signups', c.signups, 'confirmed', c.confirmed,
        'started', c.started, 'came_back', c.came_back, 'active_7d', c.active_7d) order by c.week_start) from cohorts c),
    'before_v8', (select jsonb_build_object('signups', count(*), 'started', count(*) filter (where started),
        'came_back', count(*) filter (where started and came_back)) from facts where created_at < '2026-10-14'),
    'since_v8', (select jsonb_build_object('signups', count(*), 'started', count(*) filter (where started),
        'came_back', count(*) filter (where started and came_back)) from facts where created_at >= '2026-10-14'),
    'cleanup', jsonb_build_object(
      'unconfirmed', (select count(*) from facts where junk = 'unconfirmed'),
      'empty', (select count(*) from facts where junk = 'empty')),
    'database_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'largest_tables', (select jsonb_agg(t) from (
      select c.relname as name, pg_catalog.pg_total_relation_size(c.oid) as bytes
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by 2 desc limit 5) t)
  ) into result;
  return result;
end; $$;

-- Cleanup: what would go, newest first, with no emails. The owner only.
create or replace function public.owner_cleanup_preview(page_size integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_community_owner() then raise exception 'Owner required' using errcode = '42501'; end if;
  with junk as (
    select f.created_at, f.email_confirmed_at is not null as confirmed, f.last_active_at, f.junk as reason
    from public.admin_account_facts() f
  )
  select jsonb_build_object(
    'unconfirmed', (select count(*) from junk where reason = 'unconfirmed'),
    'empty', (select count(*) from junk where reason = 'empty'),
    'sample', coalesce((select jsonb_agg(s) from (
      select reason, created_at, confirmed, last_active_at from junk where reason is not null
      order by created_at desc limit least(greatest(coalesce(page_size, 50), 1), 200)) s), '[]'::jsonb)
  ) into result;
  return result;
end; $$;

-- The ids the edge function deletes, re-checked at that moment. 'all' returns
-- every junk account only when the count still equals what the owner
-- confirmed; 'one' returns the target only when its @username (or DELETE when
-- it has none) was typed and it isn't staff or a backer. The owner only.
create or replace function public.owner_accounts_to_delete(
  delete_mode text, expected_count integer default null, target uuid default null, typed text default ''
) returns uuid[] language plpgsql stable security definer set search_path = '' as $$
declare ids uuid[];
declare person record;
begin
  if not public.is_community_owner() then raise exception 'Owner required' using errcode = '42501'; end if;
  if delete_mode = 'all' then
    select coalesce(array_agg(f.user_id), '{}') into ids from public.admin_account_facts() f where f.junk is not null;
    if coalesce(pg_catalog.array_length(ids, 1), 0) <> coalesce(expected_count, -1) then
      raise exception 'The list changed since you looked. Open it again.';
    end if;
    return ids;
  elsif delete_mode = 'one' then
    select * into person from public.admin_account_facts() f where f.user_id = target;
    if person.user_id is null then raise exception 'Person not found'; end if;
    if person.user_id = auth.uid() or person.staff_role is not null then raise exception 'Staff accounts can''t be deleted here. Remove the admin first.'; end if;
    if person.is_backer then raise exception 'Backers can''t be deleted here.'; end if;
    if pg_catalog.btrim(coalesce(typed, '')) <> coalesce(person.username, 'DELETE') then
      raise exception 'Type their @username to confirm.';
    end if;
    return array[person.user_id];
  end if;
  raise exception 'Unknown delete mode';
end; $$;

-- Writes the audit line after the edge function has deleted accounts.
create or replace function public.owner_log_deletion(deleted integer, delete_mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_community_owner() then raise exception 'Owner required' using errcode = '42501'; end if;
  insert into public.community_audit_log(admin_id, action, reason)
  values (auth.uid(), case when delete_mode = 'one' then 'account.deleted' else 'accounts.cleanup' end, deleted::text);
end; $$;

revoke execute on function public.admin_account_facts() from public, anon, authenticated;
revoke execute on function public.admin_person_view(jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.admin_hub_role() from public, anon;
revoke execute on function public.admin_people(text, text, integer, integer) from public, anon;
revoke execute on function public.admin_person(uuid) from public, anon;
revoke execute on function public.owner_set_staff(uuid, text) from public, anon;
revoke execute on function public.owner_growth_report(integer) from public, anon;
revoke execute on function public.owner_cleanup_preview(integer) from public, anon;
revoke execute on function public.owner_accounts_to_delete(text, integer, uuid, text) from public, anon;
revoke execute on function public.owner_log_deletion(integer, text) from public, anon;
grant execute on function public.admin_hub_role() to authenticated;
grant execute on function public.admin_people(text, text, integer, integer) to authenticated;
grant execute on function public.admin_person(uuid) to authenticated;
grant execute on function public.owner_set_staff(uuid, text) to authenticated;
grant execute on function public.owner_growth_report(integer) to authenticated;
grant execute on function public.owner_cleanup_preview(integer) to authenticated;
grant execute on function public.owner_accounts_to_delete(text, integer, uuid, text) to authenticated;
grant execute on function public.owner_log_deletion(integer, text) to authenticated;
