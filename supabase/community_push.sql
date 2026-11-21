-- Supabase Snippet Name: YouDO — Community Push
-- Apply after push_dispatch.sql, hub_push.sql, board_update_push.sql,
-- community_hashtags.sql and community_rooms.sql. Rerunnable.
-- Run the whole query once in the private Supabase SQL Editor (do not save it).
--
-- Public Hub and Admin Hub notifications become real pushes, sent while the app
-- is closed; inside the app the unread dots always show and have no switch.
--
--   Community chat (General and exam hashtag rooms), per Settings ->
--   Notifications -> Community chat (push_preferences.community_messages):
--     'mentions' (default): someone @mentions you, or replies to your message;
--     'all':                also every new message in your own hashtag room;
--     'off':                nothing.
--   One notification per room (tag), updated in place.
--
--   Admin Hub (community admins only), each with its own switch:
--     a new hashtag request (admin_requests), a requester answering an admin's
--     note (admin_replies), a reported message (admin_reports).
--
-- Data keys avoid FCM's reserved names (see hub_push.sql).

begin;

alter table public.push_preferences add column if not exists community_messages text not null default 'mentions';
alter table public.push_preferences drop constraint if exists push_preferences_community_messages_check;
alter table public.push_preferences add constraint push_preferences_community_messages_check
  check (community_messages in ('all', 'mentions', 'off'));
alter table public.push_preferences add column if not exists admin_requests boolean not null default true;
alter table public.push_preferences add column if not exists admin_replies boolean not null default true;
alter table public.push_preferences add column if not exists admin_reports boolean not null default true;

-- A person's community chat choice; no saved row means the default.
create or replace function private.community_push_mode(person uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select p.community_messages from public.push_preferences p where p.user_id = person), 'mentions');
$$;
revoke all on function private.community_push_mode(uuid) from public, anon, authenticated;

-- 1. Community chat.
create or replace function private.push_community_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare room_label text;
declare place text;
declare sender text;
declare replied uuid;
declare mentioned uuid[];
declare everyone uuid[];
declare push_data jsonb;
begin
  if new.message_kind <> 'chat' or new.removed_at is not null or public.is_community_banned(new.author_id) then
    return null;
  end if;

  if new.room_id is not null then
    select h.label into room_label from public.community_hashtags h where h.id = new.room_id and h.active;
    if room_label is null then return null; end if;
    place := '#' || room_label;
  else
    place := 'Community';
  end if;

  -- The author of the message this one replies to.
  if new.reply_to is not null then
    select m.author_id into replied from public.community_messages m
    where m.id = new.reply_to and m.removed_at is null and m.author_id <> new.author_id;
    if replied is not null and (private.community_push_mode(replied) = 'off' or not public.can_join_community(replied)) then
      replied := null;
    end if;
  end if;

  -- People @mentioned by username (lowercase letters, digits and underscores);
  -- the @ starts a word, so an address like x@asha.in is not a mention.
  if pg_catalog.strpos(new.body, '@') > 0 then
    select pg_catalog.array_agg(distinct p.id) into mentioned
    from (select pg_catalog.lower(found.groups[2]) as handle
          from pg_catalog.regexp_matches(new.body, '(^|[^A-Za-z0-9_])@([A-Za-z0-9_]+)', 'g') as found(groups)) tokens
    join public.profiles p on p.username = tokens.handle
    where p.id <> new.author_id
      and p.id is distinct from replied
      and public.can_join_community(p.id)
      and private.community_push_mode(p.id) <> 'off';
  end if;

  -- In a hashtag room, the room's own members who chose "All messages".
  if new.room_id is not null then
    select pg_catalog.array_agg(hm.user_id) into everyone
    from public.community_hashtag_memberships hm
    join public.push_preferences pp on pp.user_id = hm.user_id
    where hm.hashtag_id = new.room_id
      and hm.user_id <> new.author_id
      and hm.user_id is distinct from replied
      and not (hm.user_id = any (coalesce(mentioned, '{}'::uuid[])))
      and pp.community_messages = 'all'
      and public.can_join_community(hm.user_id);
  end if;

  if replied is null and mentioned is null and everyone is null then return null; end if;

  sender := private.push_handle(new.author_id);
  push_data := pg_catalog.jsonb_build_object(
    'type', 'community',
    'room', coalesce(new.room_id::text, ''),
    'tag', 'community-' || coalesce(new.room_id::text, 'general'),
    'channel', 'public-hub'
  );
  if replied is not null then
    perform private.dispatch_push(array[replied], sender || ' replied in ' || place, pg_catalog.left(new.body, 140), push_data);
  end if;
  if mentioned is not null then
    perform private.dispatch_push(mentioned, sender || ' mentioned you in ' || place, pg_catalog.left(new.body, 140), push_data);
  end if;
  if everyone is not null then
    perform private.dispatch_push(everyone, place, sender || ': ' || pg_catalog.left(new.body, 120), push_data);
  end if;
  return null;
end; $$;
revoke all on function private.push_community_message() from public, anon, authenticated;

drop trigger if exists trg_push_community_message on public.community_messages;
create trigger trg_push_community_message after insert on public.community_messages
  for each row execute function private.push_community_message();

-- 2. Admin Hub: the admins who want this kind, never the person who caused it.
create or replace function private.push_admins(kind text, actor uuid, push_title text, push_body text, push_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare admins uuid[];
begin
  select pg_catalog.array_agg(a.user_id) into admins
  from public.community_admins a
  left join public.push_preferences pp on pp.user_id = a.user_id
  where a.user_id is distinct from actor
    and coalesce(case kind
      when 'requests' then pp.admin_requests
      when 'replies' then pp.admin_replies
      when 'reports' then pp.admin_reports
    end, true);
  perform private.dispatch_push(admins, push_title, push_body, push_data);
end; $$;
revoke all on function private.push_admins(text, uuid, text, text, jsonb) from public, anon, authenticated;

-- A new hashtag request, or a requester answering an admin's note (waiting -> open).
create or replace function private.push_admin_hashtag_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status = 'open' then
    perform private.push_admins('requests', new.requester_id,
      'New hashtag request', private.push_handle(new.requester_id) || ' asked for #' || new.exam_name || '.',
      pg_catalog.jsonb_build_object('type', 'admin_request', 'tag', 'admin-requests', 'channel', 'admin-hub'));
  elsif tg_op = 'UPDATE' and old.status = 'waiting' and new.status = 'open' then
    perform private.push_admins('replies', new.requester_id,
      'Support chat reply', private.push_handle(new.requester_id) || ' answered your note about #' || new.exam_name || '.',
      pg_catalog.jsonb_build_object('type', 'admin_reply', 'tag', 'admin-replies', 'channel', 'admin-hub'));
  end if;
  return null;
end; $$;
revoke all on function private.push_admin_hashtag_request() from public, anon, authenticated;

drop trigger if exists trg_push_admin_hashtag_request on public.community_hashtag_requests;
create trigger trg_push_admin_hashtag_request after insert or update of status on public.community_hashtag_requests
  for each row execute function private.push_admin_hashtag_request();

-- A reported message.
create or replace function private.push_admin_report()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'open' then return null; end if;
  perform private.push_admins('reports', new.reporter_id,
    'Message reported', 'A community message was reported: ' || pg_catalog.left(new.reason, 80) || '.',
    pg_catalog.jsonb_build_object('type', 'admin_report', 'tag', 'admin-reports', 'channel', 'admin-hub'));
  return null;
end; $$;
revoke all on function private.push_admin_report() from public, anon, authenticated;

drop trigger if exists trg_push_admin_report on public.community_reports;
create trigger trg_push_admin_report after insert on public.community_reports
  for each row execute function private.push_admin_report();

commit;
