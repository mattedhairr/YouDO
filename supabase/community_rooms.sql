-- Apply after community_hashtag_admin.sql and board_evidence.sql.
-- Existing messages remain General. No data is deleted or reclassified.
begin;

alter table public.community_messages add column if not exists room_id uuid
  references public.community_hashtags(id) on delete restrict;
create index if not exists community_messages_room_sequence_idx
  on public.community_messages(room_id, sequence desc);
alter table public.community_hashtag_memberships add column if not exists posting_unlock_at timestamptz;
alter table public.community_hashtag_memberships add column if not exists posting_cutoff_sequence bigint not null default 0;

-- All assignment paths (including admin approval) share the send lock. Clearing
-- and reselecting a tag cannot evade the lifetime of earlier hashtag messages.
create or replace function public.community_room_membership_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(new.user_id,old.user_id)::text,0));
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' and new.hashtag_id=old.hashtag_id then
    new.posting_unlock_at := old.posting_unlock_at;
    new.posting_cutoff_sequence := old.posting_cutoff_sequence;
  else
    select max(expires_at),coalesce(max(sequence),0) into new.posting_unlock_at,new.posting_cutoff_sequence from public.community_messages
    where author_id=new.user_id and room_id is not null and removed_at is null and expires_at>now();
  end if;
  return new;
end; $$;
drop trigger if exists community_room_membership_guard on public.community_hashtag_memberships;
create trigger community_room_membership_guard before insert or update or delete
  on public.community_hashtag_memberships for each row execute function public.community_room_membership_guard();
revoke execute on function public.community_room_membership_guard() from public,anon,authenticated;

create table if not exists public.community_room_read_state (
  user_id uuid not null references public.community_read_state(user_id) on delete cascade,
  room_id uuid not null references public.community_hashtags(id) on delete cascade,
  read_sequence bigint not null default 0,
  primary key(user_id,room_id)
);
alter table public.community_room_read_state enable row level security;
revoke all on public.community_room_read_state from public,anon,authenticated;

create or replace function public.community_room_unlock_at()
returns timestamptz language sql stable security definer set search_path = '' as $$
  select least(hm.posting_unlock_at, (select max(m.expires_at)
    from public.community_messages m where m.author_id=auth.uid() and m.room_id is not null
      and m.sequence<=hm.posting_cutoff_sequence and m.removed_at is null and m.expires_at>now()))
  from public.community_hashtag_memberships hm
  where hm.user_id=auth.uid() and hm.posting_unlock_at>now()
    and exists(select 1 from public.community_messages m where m.author_id=auth.uid()
      and m.room_id is not null and m.sequence<=hm.posting_cutoff_sequence and m.removed_at is null and m.expires_at>now());
$$;
create or replace function public.can_write_community_room(selected_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_join_community() and (selected_room is null or (
    exists(select 1 from public.community_hashtag_memberships hm
      join public.community_hashtags h on h.id=hm.hashtag_id and h.active
      where hm.user_id=auth.uid() and hm.hashtag_id=selected_room)
    and public.community_room_unlock_at() is null));
$$;
revoke execute on function public.community_room_unlock_at() from public,anon;
revoke execute on function public.can_write_community_room(uuid) from public,anon;
grant execute on function public.community_room_unlock_at(), public.can_write_community_room(uuid) to authenticated;

create or replace function public.community_chat_visible(message public.community_messages)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_join_community() and message.removed_at is null and message.expires_at>now()
    and not public.is_community_banned(message.author_id)
    and (message.room_id is null or exists(select 1 from public.community_hashtags h where h.id=message.room_id and h.active))
    and exists(select 1 from public.community_read_state s where s.user_id=auth.uid() and message.created_at>=s.visible_from);
$$;

create or replace function public.community_chat_page_by_hashtag(before_sequence bigint default null, selected_hashtag uuid default null)
returns setof public.community_messages language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_join_community() then raise exception 'Board membership required' using errcode='42501'; end if;
  if selected_hashtag is not null and not exists(select 1 from public.community_hashtags where id=selected_hashtag and active)
    then raise exception 'This exam room is unavailable'; end if;
  return query with recent as materialized (
    select m.* from public.community_messages m where m.room_id is not distinct from selected_hashtag
      and public.community_chat_visible(m) order by m.sequence desc limit 120
  ) select * from recent where before_sequence is null or sequence<before_sequence order by sequence desc limit 30;
end; $$;
create or replace function public.community_chat_page(before_sequence bigint default null)
returns setof public.community_messages language sql stable security definer set search_path = '' as $$
  select * from public.community_chat_page_by_hashtag(before_sequence,null);
$$;
create or replace function public.community_inbox(keep_visible uuid[] default '{}')
returns setof public.community_messages language sql stable security definer set search_path = '' as $$
  select recent.* from (select m.* from public.community_messages m
    where m.room_id is null and public.community_chat_visible(m) order by m.sequence desc limit 120) recent order by sequence;
$$;

create or replace function public.send_community_room_message(
  client_id uuid, message_body text, selected_room uuid, reply_to_message uuid default null, expected_author uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare clean text := btrim(regexp_replace(coalesce(message_body,''),'\s+',' ','g'));
declare existing public.community_messages;
begin
  if expected_author is not null and expected_author is distinct from auth.uid() then raise exception 'Account changed; message was not sent' using errcode='42501'; end if;
  if auth.uid() is null or not public.can_join_community() then raise exception 'Board membership required' using errcode='42501'; end if;
  if client_id is null then raise exception 'Message identity required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if selected_room is not null then
    perform 1 from public.community_hashtags where id=selected_room and active for share;
    if not found then raise exception 'This exam room is unavailable'; end if;
  end if;
  select * into existing from public.community_messages where id=client_id;
  if found then
    if existing.author_id<>auth.uid() or existing.room_id is distinct from selected_room
      or not public.community_chat_visible(existing) then raise exception 'Message unavailable'; end if;
    return to_jsonb(existing);
  end if;
  if not public.can_write_community_room(selected_room) then
    raise exception 'This room is read-only. Choose your profile hashtag and wait for earlier hashtag messages to expire.' using errcode='42501';
  end if;
  if not public.can_post_community() then raise exception 'Posting is paused or rate limited' using errcode='42501'; end if;
  if char_length(clean) not between 1 and 240 or clean ~* '(https?://|www\.|t\.me/)' then raise exception 'Use 1–240 characters without links'; end if;
  if reply_to_message is not null and not exists(select 1 from public.community_messages m
    where m.id=reply_to_message and m.room_id is not distinct from selected_room and public.community_chat_visible(m))
    then raise exception 'Replies must stay in the same room'; end if;
  insert into public.community_messages(id,author_id,body,message_kind,reply_to,room_id)
    values(client_id,auth.uid(),clean,'chat',reply_to_message,selected_room) returning * into existing;
  return to_jsonb(existing);
end; $$;
-- Old clients have no destination. Their posts always enter General.
create or replace function public.send_community_message(
  client_id uuid, message_body text, reply_to_message uuid default null, expected_author uuid default null
) returns jsonb language sql security definer set search_path = '' as $$
  select public.send_community_room_message(client_id,message_body,null,reply_to_message,expected_author);
$$;
revoke execute on function public.send_community_room_message(uuid,text,uuid,uuid,uuid) from public,anon;
grant execute on function public.send_community_room_message(uuid,text,uuid,uuid,uuid) to authenticated;

-- Edits are writes too. Changing a hashtag must not leave the previous room editable.
create or replace function public.edit_community_message(target_message uuid, message_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.community_messages;
declare clean text := btrim(regexp_replace(coalesce(message_body,''),'\s+',' ','g'));
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select * into item from public.community_messages where id=target_message for update;
  if item.id is null or item.author_id<>auth.uid() or not public.community_chat_visible(item) or item.message_kind<>'chat'
    or item.created_at<now()-interval '15 minutes' then raise exception 'Only your normal messages from the last 15 minutes can be edited' using errcode='42501'; end if;
  if not public.can_write_community_room(item.room_id) then raise exception 'This room is read-only' using errcode='42501'; end if;
  if exists(select 1 from public.community_members where user_id=auth.uid() and muted_until>now())
    or not coalesce((select room_enabled from public.community_settings where id=1),false) then raise exception 'Posting is paused'; end if;
  if char_length(clean) not between 1 and 240 or clean ~* '(https?://|www\.|t\.me/)' then raise exception 'Use 1–240 characters without links'; end if;
  if clean<>item.body then update public.community_messages set body=clean,edited_at=now() where id=target_message returning * into item; end if;
  return to_jsonb(item);
end; $$;

create or replace function public.read_community_room_messages(message_ids uuid[], selected_room uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare last_seen bigint;
begin
  if not public.can_join_community() then raise exception 'Board membership required' using errcode='42501'; end if;
  select max(m.sequence) into last_seen from public.community_messages m
    where m.id=any(message_ids[1:120]) and m.room_id is not distinct from selected_room and public.community_chat_visible(m);
  if last_seen is null then return; end if;
  if selected_room is null then
    update public.community_read_state set chat_read_sequence=greatest(chat_read_sequence,last_seen) where user_id=auth.uid();
  else
    insert into public.community_room_read_state(user_id,room_id,read_sequence) values(auth.uid(),selected_room,last_seen)
    on conflict(user_id,room_id) do update set read_sequence=greatest(community_room_read_state.read_sequence,excluded.read_sequence);
  end if;
end; $$;
create or replace function public.read_community_messages(message_ids uuid[])
returns void language sql security definer set search_path = '' as $$
  select public.read_community_room_messages(message_ids,null);
$$;
revoke execute on function public.read_community_room_messages(uuid[],uuid) from public,anon;
grant execute on function public.read_community_room_messages(uuid[],uuid) to authenticated;

create or replace function public.community_room_unread()
returns table(room_id uuid, unread bigint) language sql stable security definer set search_path = '' as $$
  with ranked as (
    select m.*,row_number() over(partition by m.room_id order by m.sequence desc) rn
    from public.community_messages m where public.community_chat_visible(m)
  ) select m.room_id,count(*) from ranked m
    join public.community_read_state s on s.user_id=auth.uid()
    left join public.community_room_read_state r on r.user_id=auth.uid() and r.room_id=m.room_id
    where m.rn<=120 and m.author_id<>auth.uid()
      and m.sequence>case when m.room_id is null then s.chat_read_sequence else coalesce(r.read_sequence,0) end
    group by m.room_id;
$$;
create or replace function public.community_chat_state()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('chat',coalesce((select sum(unread) from public.community_room_unread()),0),
    'updates',coalesce((select case when s.announcement<>'' and r.updates_read_revision<s.announcement_revision then 1 else 0 end
      from public.community_read_state r cross join public.community_settings s where r.user_id=auth.uid() and s.id=1),0));
$$;
create or replace function public.community_room_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.community_hashtag_context() || jsonb_build_object(
    'rooms_enabled',true,'server_now',now(),'posting_unlock_at',public.community_room_unlock_at(),
    'room_unread',coalesce((select jsonb_agg(jsonb_build_object('room_id',room_id,'count',unread)) from public.community_room_unread()),'[]'::jsonb));
$$;
revoke execute on function public.community_room_unread(), public.community_room_context() from public,anon;
grant execute on function public.community_room_unread(), public.community_room_context() to authenticated;

commit;
