-- YouDO community layer: positive kudos, an ephemeral daily room,
-- and least-privilege moderation. Safe to rerun in the Supabase SQL editor.

begin;

create extension if not exists pgcrypto;

create table if not exists public.community_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.community_settings (
  id smallint primary key default 1 check (id = 1),
  room_enabled boolean not null default true,
  appreciations_enabled boolean not null default true,
  announcement text not null default '',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.community_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.community_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  muted_until timestamptz,
  banned_at timestamptz,
  moderation_note text not null default '',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.community_members add column if not exists display_name text not null default '';

create table if not exists public.community_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 20 and 600),
  status text not null default 'open' check (status in ('open', 'approved', 'declined')),
  admin_response text not null default '' check (char_length(admin_response) <= 600),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_appreciations (
day_key date not null default (now() at time zone 'UTC')::date,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (day_key, from_user, to_user),
  check (from_user <> to_user)
);

create table if not exists public.community_messages (
  id uuid primary key default gen_random_uuid(),
  day_key date not null default (now() at time zone 'UTC')::date,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 240),
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.community_messages add column if not exists message_kind text not null default 'chat';
alter table public.community_messages add column if not exists expires_at timestamptz;
update public.community_messages set expires_at = created_at + interval '24 hours' where expires_at is null;
alter table public.community_messages alter column expires_at set default (now() + interval '24 hours');
alter table public.community_messages alter column expires_at set not null;
alter table public.community_messages add column if not exists reply_to uuid references public.community_messages(id) on delete set null;
create index if not exists community_messages_expiry_idx on public.community_messages(expires_at);
create index if not exists community_messages_reply_idx on public.community_messages(reply_to) where reply_to is not null;

-- Deliveries are private per-account state, never an admin read-receipt dashboard.
create table if not exists public.community_deliveries (
  user_id uuid not null references public.public_pace(user_id) on delete cascade,
  message_id uuid not null references public.community_messages(id) on delete cascade,
  read_at timestamptz,
  primary key (user_id, message_id)
);
alter table public.community_deliveries enable row level security;
revoke all on public.community_deliveries from public, anon, authenticated;
create index if not exists community_deliveries_unread_idx on public.community_deliveries(message_id) where read_at is null;

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.community_messages (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null default 'Unhelpful or disrespectful',
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);

create table if not exists public.community_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users (id) on delete set null,
  message_id uuid references public.community_messages (id) on delete set null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

-- Preserve moderation history without blocking an admin's own account deletion.
-- Upgrade the earlier NOT NULL / RESTRICT foreign key as well as fresh installs.
alter table public.community_audit_log alter column admin_id drop not null;
alter table public.community_audit_log drop constraint if exists community_audit_log_admin_id_fkey;
alter table public.community_audit_log add constraint community_audit_log_admin_id_fkey
  foreign key (admin_id) references auth.users (id) on delete set null;

create index if not exists community_messages_day_created_idx on public.community_messages(day_key, created_at);
create index if not exists community_messages_author_recent_idx on public.community_messages(author_id, created_at desc);
create index if not exists community_reports_status_created_idx on public.community_reports(status, created_at desc);
create index if not exists board_appreciations_target_day_idx on public.board_appreciations(to_user, day_key);
create index if not exists community_appeals_user_created_idx on public.community_appeals(user_id, created_at desc);
create index if not exists community_appeals_status_created_idx on public.community_appeals(status, created_at);
create unique index if not exists community_appeals_one_open_idx on public.community_appeals(user_id) where status = 'open';

create or replace function public.is_community_admin(candidate uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.community_admins where user_id = candidate); $$;

create or replace function public.is_community_banned(candidate uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.community_members where user_id = candidate and banned_at is not null); $$;

create or replace function public.community_today()
returns date language sql stable set search_path = public
as $$ select (now() at time zone 'UTC')::date; $$;

create or replace function public.can_join_community(candidate uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select candidate is not null
    and exists (select 1 from public.public_pace where user_id = candidate)
    and not exists (
      select 1 from public.community_members
      where user_id = candidate and banned_at is not null
    );
$$;

create or replace function public.can_post_community(candidate uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select public.can_join_community(candidate)
    and coalesce((select room_enabled from public.community_settings where id = 1), false)
    and not exists (
      select 1 from public.community_members
      where user_id = candidate and muted_until is not null and muted_until > now()
    )
    and (select count(*) from public.community_messages where author_id = candidate and created_at > now() - interval '1 minute') < 4
    and (select count(*) from public.community_messages where author_id = candidate and day_key = (now() at time zone 'UTC')::date) < 40;
$$;

-- One round trip for Board controls. Older clients can keep using the individual
-- tables and helper functions while this migration rolls out.
create or replace function public.community_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'day_key', public.community_today(),
    'is_admin', public.is_community_admin(),
    'can_join', public.can_join_community(),
    'can_post', public.can_post_community(),
    'settings', pg_catalog.jsonb_build_object(
      'room_enabled', coalesce(s.room_enabled, false),
      'appreciations_enabled', coalesce(s.appreciations_enabled, false),
      'announcement', coalesce(s.announcement, '')
    ),
    'muted_until', m.muted_until,
    'banned_at', m.banned_at,
    'appeal', (
      select pg_catalog.to_jsonb(a) from (
        select ca.id, ca.user_id, ca.message, ca.status, ca.admin_response, ca.created_at, ca.reviewed_at
        from public.community_appeals ca
        where ca.user_id = auth.uid()
        order by ca.created_at desc limit 1
      ) a
    )
  )
  from public.community_settings s
  left join public.community_members m on m.user_id = auth.uid()
  where s.id = 1;
$$;

create or replace function public.set_community_settings(
  next_room_enabled boolean,
  next_appreciations_enabled boolean,
  next_announcement text
) returns void language plpgsql security definer set search_path = public as $$
declare current_settings public.community_settings%rowtype;
declare clean_announcement text := btrim(coalesce(next_announcement, ''));
begin
  if not public.is_community_admin() then raise exception 'admin required'; end if;
  select * into current_settings from public.community_settings where id = 1 for update;

  if current_settings.room_enabled is distinct from next_room_enabled then
    insert into public.community_audit_log(admin_id, action)
    values (auth.uid(), case when next_room_enabled then 'settings.room.enabled' else 'settings.room.disabled' end);
  end if;
  if current_settings.appreciations_enabled is distinct from next_appreciations_enabled then
    insert into public.community_audit_log(admin_id, action)
    values (auth.uid(), case when next_appreciations_enabled then 'settings.kudos.enabled' else 'settings.kudos.disabled' end);
  end if;
  if current_settings.announcement is distinct from clean_announcement then
    insert into public.community_audit_log(admin_id, action)
    values (auth.uid(), case when clean_announcement = '' then 'settings.announcement.cleared' else 'settings.announcement.published' end);
  end if;

  if current_settings.room_enabled is not distinct from next_room_enabled
    and current_settings.appreciations_enabled is not distinct from next_appreciations_enabled
    and current_settings.announcement is not distinct from clean_announcement then
    return;
  end if;

  update public.community_settings set
    room_enabled = next_room_enabled,
    appreciations_enabled = next_appreciations_enabled,
    announcement = clean_announcement,
    updated_by = auth.uid(), updated_at = now()
  where id = 1;
end; $$;

create or replace function public.moderate_community_member(
  target uuid,
  moderation_action text,
  note text default ''
) returns void language plpgsql security definer set search_path = public as $$
declare until_at timestamptz;
declare target_name text;
begin
  if not public.is_community_admin() then raise exception 'admin required'; end if;
  if public.is_community_admin(target) then raise exception 'admins cannot moderate other admins'; end if;
  if moderation_action = 'mute_24h' then until_at := now() + interval '24 hours';
  elsif moderation_action = 'mute_7d' then until_at := now() + interval '7 days';
  elsif moderation_action not in ('ban', 'restore') then raise exception 'unsupported action';
  end if;

  select display_name into target_name from public.public_pace where user_id = target;
  insert into public.community_members(user_id, display_name, muted_until, banned_at, moderation_note, updated_by, updated_at)
  values (
    target,
    coalesce(target_name, ''),
    case when moderation_action like 'mute_%' then until_at else null end,
    case when moderation_action = 'ban' then now() else null end,
    left(btrim(coalesce(note, '')), 280), auth.uid(), now()
  )
  on conflict (user_id) do update set
    display_name = case when excluded.display_name <> '' then excluded.display_name else public.community_members.display_name end,
    muted_until = excluded.muted_until,
    banned_at = excluded.banned_at,
    moderation_note = excluded.moderation_note,
    updated_by = auth.uid(), updated_at = now();

  if moderation_action = 'ban' then
    update public.community_messages set removed_at = now(), removed_by = auth.uid()
      where author_id = target and removed_at is null;
    delete from public.board_appreciations where from_user = target or to_user = target;
  end if;

  insert into public.community_audit_log(admin_id, action, target_user_id, reason)
  values (auth.uid(), 'member.' || moderation_action, target, left(btrim(coalesce(note, '')), 280));
end; $$;

create or replace function public.submit_community_appeal(appeal_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare appeal_id uuid;
declare clean_message text := btrim(coalesce(appeal_message, ''));
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  if not public.is_community_banned(auth.uid()) then raise exception 'community access is not banned'; end if;
  if char_length(clean_message) not between 20 and 600 then raise exception 'appeal must be between 20 and 600 characters'; end if;
  if exists (select 1 from public.community_appeals where user_id = auth.uid() and status = 'open') then
    raise exception 'an appeal is already under review';
  end if;
  if exists (
    select 1 from public.community_appeals
    where user_id = auth.uid() and status = 'declined' and reviewed_at > now() - interval '7 days'
  ) then raise exception 'wait seven days after a declined appeal';
  end if;

  insert into public.community_appeals(user_id, message)
  values (auth.uid(), clean_message) returning id into appeal_id;
  return appeal_id;
end; $$;

create or replace function public.review_community_appeal(
  target_appeal uuid,
  decision text,
  response_note text default ''
) returns void language plpgsql security definer set search_path = public as $$
declare appeal_user uuid;
declare clean_response text := left(btrim(coalesce(response_note, '')), 600);
begin
  if not public.is_community_admin() then raise exception 'admin required'; end if;
  if decision not in ('approve', 'decline') then raise exception 'unsupported decision'; end if;
  if decision = 'decline' and char_length(clean_response) < 5 then raise exception 'include a short reason for declining'; end if;

  select user_id into appeal_user from public.community_appeals
    where id = target_appeal and status = 'open' for update;
  if appeal_user is null then raise exception 'appeal is no longer open'; end if;

  update public.community_appeals set
    status = case when decision = 'approve' then 'approved' else 'declined' end,
    admin_response = clean_response,
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = target_appeal;

  if decision = 'approve' then
    update public.community_members set muted_until = null, banned_at = null,
      moderation_note = clean_response, updated_by = auth.uid(), updated_at = now()
    where user_id = appeal_user;
  end if;

  insert into public.community_audit_log(admin_id, action, target_user_id, reason)
  values (auth.uid(), 'appeal.' || decision, appeal_user, clean_response);
end; $$;

create or replace function public.remove_community_message(target_message uuid, note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare target_author uuid;
begin
  if not public.is_community_admin() then raise exception 'admin required'; end if;
  update public.community_messages set removed_at = now(), removed_by = auth.uid()
    where id = target_message returning author_id into target_author;
  update public.community_reports set status = 'actioned', reviewed_by = auth.uid(), reviewed_at = now()
    where message_id = target_message and status = 'open';
  insert into public.community_audit_log(admin_id, action, target_user_id, message_id, reason)
  values (auth.uid(), 'message.removed', target_author, target_message, left(btrim(coalesce(note, '')), 280));
end; $$;

create or replace function public.dismiss_community_report(target_report uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_community_admin() then raise exception 'admin required'; end if;
  update public.community_reports set status = 'dismissed', reviewed_by = auth.uid(), reviewed_at = now()
    where id = target_report;
  insert into public.community_audit_log(admin_id, action, reason)
  values (auth.uid(), 'report.dismissed', target_report::text);
end; $$;

create or replace function public.prune_community_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Members see a rolling 24-hour room; retain a short moderation window after expiry.
  delete from public.community_messages cm where expires_at < now() - interval '7 days'
    and not exists (select 1 from public.community_reports r where r.message_id = cm.id and r.status = 'open')
    and (cm.removed_at is not null or not exists (
      select 1 from public.community_deliveries d where d.message_id = cm.id and d.read_at is null
    ));
  delete from public.board_appreciations where day_key < (now() at time zone 'UTC')::date - 31;
  return null;
end; $$;

drop trigger if exists prune_after_community_message on public.community_messages;
create trigger prune_after_community_message after insert on public.community_messages
  for each statement execute function public.prune_community_history();
drop trigger if exists prune_after_appreciation on public.board_appreciations;
create trigger prune_after_appreciation after insert on public.board_appreciations
  for each statement execute function public.prune_community_history();

alter table public.community_admins enable row level security;
alter table public.community_settings enable row level security;
alter table public.community_members enable row level security;
alter table public.community_appeals enable row level security;
alter table public.board_appreciations enable row level security;
alter table public.community_messages enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_audit_log enable row level security;

drop policy if exists community_admins_read_self on public.community_admins;
create policy community_admins_read_self on public.community_admins for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists community_settings_read on public.community_settings;
drop policy if exists community_settings_admin on public.community_settings;
create policy community_settings_read on public.community_settings for select to authenticated using (true);
create policy community_settings_admin on public.community_settings for update to authenticated
  using (public.is_community_admin()) with check (public.is_community_admin());

drop policy if exists community_members_read on public.community_members;
create policy community_members_read on public.community_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_community_admin());

drop policy if exists community_appeals_read on public.community_appeals;
create policy community_appeals_read on public.community_appeals for select to authenticated
  using (user_id = (select auth.uid()) or public.is_community_admin());

drop policy if exists appreciations_read on public.board_appreciations;
drop policy if exists appreciations_insert on public.board_appreciations;
drop policy if exists appreciations_delete on public.board_appreciations;
create policy appreciations_read on public.board_appreciations for select to authenticated
  using (day_key = (now() at time zone 'UTC')::date or public.is_community_admin());
create policy appreciations_insert on public.board_appreciations for insert to authenticated with check (
  from_user = (select auth.uid()) and day_key = (now() at time zone 'UTC')::date
  and public.can_join_community(from_user) and public.can_join_community(to_user)
  and coalesce((select appreciations_enabled from public.community_settings where id = 1), false)
);
create policy appreciations_delete on public.board_appreciations for delete to authenticated
  using (from_user = (select auth.uid()));

drop policy if exists community_messages_read on public.community_messages;
drop policy if exists community_messages_insert on public.community_messages;
create policy community_messages_read on public.community_messages for select to authenticated
  using ((expires_at > now() and removed_at is null and public.can_join_community()) or public.is_community_admin());
create policy community_messages_insert on public.community_messages for insert to authenticated with check (
  author_id = (select auth.uid()) and day_key = (now() at time zone 'UTC')::date and public.can_post_community()
  and body !~* '(https?://|www\.|t\.me/)'
);

drop policy if exists community_reports_insert on public.community_reports;
drop policy if exists community_reports_read on public.community_reports;
create policy community_reports_insert on public.community_reports for insert to authenticated with check (
  reporter_id = (select auth.uid()) and public.can_join_community()
  and exists (
    select 1 from public.community_messages as cm
    where cm.id = community_reports.message_id and cm.author_id <> (select auth.uid()) and cm.day_key = (now() at time zone 'UTC')::date and cm.removed_at is null
  )
);
create policy community_reports_read on public.community_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_community_admin());

drop policy if exists community_audit_admin on public.community_audit_log;
create policy community_audit_admin on public.community_audit_log for select to authenticated
  using (public.is_community_admin());

-- Community bans affect only public Board visibility. Private workspace tables are unchanged.
drop policy if exists pace_select_auth on public.public_pace;
create policy pace_select_auth on public.public_pace for select to authenticated
  using ((select auth.uid()) = user_id or not public.is_community_banned(user_id));

revoke execute on function public.is_community_admin(uuid) from public, anon;
revoke execute on function public.is_community_banned(uuid) from public, anon;
revoke execute on function public.community_today() from public, anon;
revoke execute on function public.can_join_community(uuid) from public, anon;
revoke execute on function public.can_post_community(uuid) from public, anon;
revoke execute on function public.set_community_settings(boolean, boolean, text) from public, anon;
revoke execute on function public.moderate_community_member(uuid, text, text) from public, anon;
revoke execute on function public.remove_community_message(uuid, text) from public, anon;
revoke execute on function public.dismiss_community_report(uuid) from public, anon;
revoke execute on function public.submit_community_appeal(text) from public, anon;
revoke execute on function public.review_community_appeal(uuid, text, text) from public, anon;
revoke execute on function public.prune_community_history() from public, anon, authenticated;

grant execute on function public.is_community_admin(uuid) to authenticated;
grant execute on function public.is_community_banned(uuid) to authenticated;
grant execute on function public.community_today() to authenticated;
grant execute on function public.can_join_community(uuid) to authenticated;
grant execute on function public.can_post_community(uuid) to authenticated;
grant execute on function public.set_community_settings(boolean, boolean, text) to authenticated;
grant execute on function public.moderate_community_member(uuid, text, text) to authenticated;
grant execute on function public.remove_community_message(uuid, text) to authenticated;
grant execute on function public.dismiss_community_report(uuid) to authenticated;
grant execute on function public.submit_community_appeal(text) to authenticated;
grant execute on function public.review_community_appeal(uuid, text, text) to authenticated;

-- Privacy-minimal activity: only opted-in Board members; no task or page history.
create table if not exists public.community_activity (
  user_id uuid primary key references public.public_pace(user_id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.community_activity enable row level security;
revoke all on table public.community_activity from public, anon, authenticated;
create index if not exists community_activity_seen_idx on public.community_activity(last_seen_at);

create or replace function public.record_community_activity()
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_join_community(auth.uid()) then return; end if;
  insert into public.community_activity(user_id, last_seen_at) values (auth.uid(), now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at
    where community_activity.last_seen_at < now() - interval '1 minute';
end;
$$;

create or replace function public.community_activity_summary()
returns jsonb language plpgsql stable security definer set search_path = public set timezone = 'UTC'
as $$
declare result jsonb;
begin
  if not public.is_community_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'day_key', (now() at time zone 'UTC')::date, 'as_of', now(),
    'active_recently', count(*) filter (where a.last_seen_at > now() - interval '5 minutes'),
    'visited_today', count(*) filter (where a.last_seen_at >= (now() at time zone 'UTC')::date::timestamptz),
    'board_members', count(*)
  ) into result
  from public.public_pace p
  left join public.community_activity a on a.user_id = p.user_id
  where not exists (select 1 from public.community_members m where m.user_id = p.user_id and m.banned_at is not null);
  return result;
end;
$$;
revoke execute on function public.record_community_activity() from public, anon;
revoke execute on function public.community_activity_summary() from public, anon;
grant execute on function public.record_community_activity() to authenticated;
grant execute on function public.community_activity_summary() to authenticated;

-- Fan out only to members present when a message is posted, not future signups.
create or replace function public.deliver_community_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.community_deliveries(user_id, message_id)
    select p.user_id, new.id from public.public_pace p
    where public.can_join_community(p.user_id);
  return new;
end; $$;
drop trigger if exists deliver_community_message on public.community_messages;
create trigger deliver_community_message after insert on public.community_messages
  for each row execute function public.deliver_community_message();
revoke execute on function public.deliver_community_message() from public, anon, authenticated;

-- One-time rolling-window catch-up. Reruns never duplicate deliveries.
insert into public.community_deliveries(user_id, message_id)
select p.user_id, m.id from public.public_pace p cross join public.community_messages m
where m.expires_at > now() and m.removed_at is null and public.can_join_community(p.user_id)
on conflict (user_id, message_id) do nothing;

create or replace function public.community_inbox(keep_visible uuid[] default '{}')
returns setof public.community_messages language sql stable security definer set search_path = '' as $$
  select recent.* from (
    select m.* from public.community_messages m
    join public.community_deliveries d on d.message_id = m.id and d.user_id = auth.uid()
    where public.can_join_community() and m.removed_at is null
      and not public.is_community_banned(m.author_id)
      and m.expires_at > now()
    order by m.created_at desc, m.id desc limit 120
  ) recent
  order by recent.created_at, recent.id;
$$;

create or replace function public.read_community_messages(message_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_join_community() then raise exception 'Board membership required' using errcode = '42501'; end if;
  update public.community_deliveries set read_at = now()
  where user_id = auth.uid() and message_id = any(message_ids[1:120]) and read_at is null;
end; $$;

-- App clients cannot forge timestamps, authors, expiry, removals, or system notes.
revoke insert on public.community_messages from authenticated;
drop policy if exists community_messages_insert on public.community_messages;
drop function if exists public.post_community_message(text);
create or replace function public.post_community_message(message_body text, reply_to_message uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare clean text := btrim(regexp_replace(coalesce(message_body, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if not public.can_post_community() then raise exception 'Posting is paused or rate limited' using errcode = '42501'; end if;
  if char_length(clean) not between 1 and 240 or clean ~* '(https?://|www\.|t\.me/)' then raise exception 'Use 1–240 characters without links'; end if;
  if reply_to_message is not null and not exists (
    select 1 from public.community_messages m
    join public.community_deliveries d on d.message_id = m.id and d.user_id = auth.uid()
    where m.id = reply_to_message and m.removed_at is null and m.expires_at > now()
  ) then raise exception 'The message you replied to is no longer available'; end if;
  insert into public.community_messages(author_id, body, message_kind, reply_to)
    values (auth.uid(), clean, 'chat', reply_to_message);
end; $$;

-- Acknowledgement + room note commit together, once per sender/recipient/UTC day.
-- Timezone chooses the current viewer's Board window, never an arbitrary past date.
alter table public.public_pace add column if not exists today_key date;
alter table public.public_pace add column if not exists week_key date;
alter table public.public_pace add column if not exists month_key date;
drop function if exists public.admire_board_member(uuid, text, text);
create or replace function public.give_board_kudos(target uuid, board_window text, board_timezone text default 'UTC')
returns void language plpgsql security definer set search_path = '' as $$
declare anchor date;
declare eligible boolean;
declare inserted_count integer;
declare sender_name text;
declare target_name text;
begin
  if auth.uid() is null or target = auth.uid() or not public.can_join_community()
    or not public.can_join_community(target) then raise exception 'Board membership required' using errcode = '42501'; end if;
  if board_window not in ('today', 'week', 'month') or board_window is null then raise exception 'Invalid Board period'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = board_timezone) then raise exception 'Invalid timezone'; end if;
  anchor := (now() at time zone board_timezone)::date;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if not coalesce((select appreciations_enabled from public.community_settings where id = 1), false)
    or exists (select 1 from public.community_members where user_id = auth.uid() and muted_until > now())
    then raise exception 'Kudos is paused' using errcode = '42501'; end if;
  with eligible_members as (
    select p.user_id, case board_window
      when 'today' then case when coalesce(p.today_key, (p.updated_at at time zone board_timezone)::date) = anchor then p.today_ms else 0 end
      when 'week' then case when coalesce(p.week_key, date_trunc('week', p.updated_at at time zone board_timezone)::date) = date_trunc('week', anchor::timestamp)::date then p.week_ms else 0 end
      else case when coalesce(p.month_key, date_trunc('month', p.updated_at at time zone board_timezone)::date) = date_trunc('month', anchor::timestamp)::date then p.month_ms else 0 end end as focus,
      greatest(1::numeric, p.bar_hours * case board_window
        when 'today' then 1
        when 'week' then 7
        else extract(day from (date_trunc('month', anchor::timestamp) + interval '1 month - 1 day'))
      end * 3600000) as bar_target
    from public.public_pace p where not public.is_community_banned(p.user_id) and btrim(p.display_name) <> ''
  ), leaders as (select user_id, focus, bar_target from eligible_members where focus > 0 order by focus desc, user_id limit 3)
  select (select count(*) from eligible_members) >= 10
    and exists (select 1 from leaders where user_id = target and focus >= bar_target) into eligible;
  if not eligible then raise exception 'Kudos unlocks only for a top-three member who reached their focus bar.'; end if;
  if (select count(*) from public.board_appreciations where from_user = auth.uid() and day_key = public.community_today()) >= 12
    then raise exception 'Daily acknowledgement limit reached'; end if;
  insert into public.board_appreciations(day_key, from_user, to_user) values (public.community_today(), auth.uid(), target)
    on conflict (day_key, from_user, to_user) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 1 and coalesce((select room_enabled from public.community_settings where id = 1), false) then
    select left(display_name, 40) into sender_name from public.public_pace where user_id = auth.uid();
    select left(display_name, 40) into target_name from public.public_pace where user_id = target;
    insert into public.community_messages(author_id, body, message_kind)
      values (auth.uid(), sender_name || ' gave ' || target_name || ' kudos · ' || case board_window when 'today' then 'today' when 'week' then 'this week' else 'this month' end, 'kudos');
  end if;
end; $$;
drop policy if exists appreciations_insert on public.board_appreciations;
drop policy if exists appreciations_delete on public.board_appreciations;
revoke insert, delete on public.board_appreciations from authenticated;

-- Messages remain reportable while they are visible in their 24-hour window.
drop policy if exists community_reports_insert on public.community_reports;
create policy community_reports_insert on public.community_reports for insert to authenticated with check (
  reporter_id = (select auth.uid()) and public.can_join_community()
  and exists (select 1 from public.community_messages m where m.id = message_id
    and m.author_id <> (select auth.uid()) and m.removed_at is null and m.expires_at > now())
);
-- Kept for compatibility with v7.1.1 and earlier. Read state no longer controls
-- visibility; community_inbox uses only each message's 24-hour expiry.
drop policy if exists community_deliveries_read_self on public.community_deliveries;
create policy community_deliveries_read_self on public.community_deliveries for select to authenticated using (user_id = (select auth.uid()));
grant select on public.community_deliveries to authenticated;
drop policy if exists community_messages_read on public.community_messages;
create policy community_messages_read on public.community_messages for select to authenticated using (
  public.is_community_admin() or (public.can_join_community() and removed_at is null and not public.is_community_banned(author_id)
    and expires_at > now()
    and exists (select 1 from public.community_deliveries d where d.message_id = id and d.user_id = (select auth.uid())))
);

revoke execute on function public.community_context() from public, anon;
revoke execute on function public.community_inbox(uuid[]) from public, anon;
revoke execute on function public.read_community_messages(uuid[]) from public, anon;
revoke execute on function public.post_community_message(text, uuid) from public, anon;
revoke execute on function public.give_board_kudos(uuid, text, text) from public, anon;
grant execute on function public.community_context() to authenticated;
grant execute on function public.community_inbox(uuid[]) to authenticated;
grant execute on function public.read_community_messages(uuid[]) to authenticated;
grant execute on function public.post_community_message(text, uuid) to authenticated;
grant execute on function public.give_board_kudos(uuid, text, text) to authenticated;

commit;

-- Promote the owner's existing account after replacing the email:
-- insert into public.community_admins (user_id)
-- select id from auth.users where lower(email) = lower('owner@example.com')
-- on conflict (user_id) do nothing;
