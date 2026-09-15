-- Apply after public_pace.sql and community.sql. Additive, rerunnable upgrade.
-- Legacy inbox/post/read RPCs remain supported. No production credentials needed.
begin;

alter table public.community_messages add column if not exists sequence bigint generated always as identity;
alter table public.community_messages add column if not exists edited_at timestamptz;
alter table public.community_messages add column if not exists mention_ids uuid[] not null default '{}';
create unique index if not exists community_messages_sequence_idx on public.community_messages(sequence desc);

-- One cursor per member replaces one delivery row per member PER message.
-- Migration reads start at the present; historical messages do not become new.
create table if not exists public.community_read_state (
  user_id uuid primary key references public.public_pace(user_id) on delete cascade,
  visible_from timestamptz not null default now(),
  chat_read_sequence bigint not null default 0
);
alter table public.community_read_state enable row level security;
revoke all on public.community_read_state from public, anon, authenticated;
insert into public.community_read_state(user_id, visible_from, chat_read_sequence)
select user_id, '-infinity'::timestamptz, coalesce((select max(sequence) from public.community_messages),0)
from public.public_pace on conflict (user_id) do nothing;

create or replace function public.community_enroll_reader()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.community_read_state(user_id, chat_read_sequence)
  values (new.user_id, coalesce((select max(sequence) from public.community_messages),0))
  on conflict (user_id) do nothing;
  return new;
end; $$;
drop trigger if exists community_enroll_reader on public.public_pace;
create trigger community_enroll_reader after insert on public.public_pace
for each row execute function public.community_enroll_reader();
revoke execute on function public.community_enroll_reader() from public, anon, authenticated;
drop trigger if exists deliver_community_message on public.community_messages;

create or replace function public.community_chat_visible(message public.community_messages)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_join_community() and message.removed_at is null and message.expires_at > now()
    and not public.is_community_banned(message.author_id)
    and exists (select 1 from public.community_read_state s where s.user_id=auth.uid() and message.created_at>=s.visible_from);
$$;
revoke execute on function public.community_chat_visible(public.community_messages) from public, anon;
grant execute on function public.community_chat_visible(public.community_messages) to authenticated;

create or replace function public.community_inbox(keep_visible uuid[] default '{}')
returns setof public.community_messages language sql stable security definer set search_path = '' as $$
  select recent.* from (
    select m.* from public.community_messages m where public.community_chat_visible(m)
    order by m.sequence desc limit 120
  ) recent order by recent.sequence;
$$;

-- Cursor is an exclusive upper bound, never a client-selected limit.
create or replace function public.community_chat_page(before_sequence bigint default null)
returns setof public.community_messages language sql stable security definer set search_path = '' as $$
  with recent as materialized (
    select m.* from public.community_messages m where public.community_chat_visible(m)
    order by m.sequence desc limit 120
  ) select * from recent where before_sequence is null or sequence<before_sequence order by sequence desc limit 30;
$$;

create or replace function public.community_chat_state()
returns jsonb language sql stable security definer set search_path = '' as $$
  with recent as materialized (
    select m.* from public.community_messages m where public.community_chat_visible(m)
    order by m.sequence desc limit 120
  ), unread as (
    select m.* from recent m join public.community_read_state s on s.user_id=auth.uid()
    where m.sequence>s.chat_read_sequence and m.author_id<>auth.uid()
  ) select jsonb_build_object('chat', count(*), 'direct', count(*) filter (
    where auth.uid()=any(mention_ids) or exists (
      select 1 from public.community_messages parent where parent.id=unread.reply_to and parent.author_id=auth.uid()
    ))) from unread;
$$;

create or replace function public.read_community_messages(message_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_join_community() then raise exception 'Board membership required' using errcode='42501'; end if;
  update public.community_read_state set chat_read_sequence=greatest(chat_read_sequence, coalesce((
    select max(m.sequence) from public.community_messages m where m.id=any(message_ids[1:120]) and public.community_chat_visible(m)
  ), 0)) where user_id=auth.uid();
end; $$;

create or replace function public.send_community_message(
  client_id uuid, message_body text, reply_to_message uuid default null, recipients uuid[] default '{}', expected_author uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare clean text := btrim(regexp_replace(coalesce(message_body,''), '\s+', ' ', 'g'));
declare existing public.community_messages;
declare mentions uuid[];
begin
  if expected_author is not null and expected_author is distinct from auth.uid() then raise exception 'Account changed; message was not sent' using errcode='42501'; end if;
  if auth.uid() is null or not public.can_join_community() then raise exception 'Board membership required' using errcode='42501'; end if;
  if client_id is null then raise exception 'Message identity required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select * into existing from public.community_messages where id=client_id;
  if found then
    if existing.author_id<>auth.uid() or not public.community_chat_visible(existing) then raise exception 'Message unavailable'; end if;
    return to_jsonb(existing); -- Retrying an uncertain response cannot create another row.
  end if;
  if not public.can_post_community() then raise exception 'Posting is paused or rate limited' using errcode='42501'; end if;
  if char_length(clean) not between 1 and 240 or clean ~* '(https?://|www\.|t\.me/)' then raise exception 'Use 1–240 characters without links'; end if;
  if coalesce(cardinality(recipients),0)>5 then raise exception 'Mention up to five members'; end if;
  select coalesce(array_agg(distinct candidate),'{}'::uuid[]) into mentions from unnest(recipients) candidate where candidate<>auth.uid();
  if exists(select 1 from unnest(mentions) candidate where not public.can_join_community(candidate)) then raise exception 'A mentioned member is unavailable'; end if;
  if reply_to_message is not null and not exists (
    select 1 from public.community_messages m where m.id=reply_to_message and public.community_chat_visible(m)
  ) then raise exception 'The message you replied to is no longer available'; end if;
  insert into public.community_messages(id,author_id,body,message_kind,reply_to,mention_ids)
  values(client_id,auth.uid(),clean,'chat',reply_to_message,mentions) returning * into existing;
  return to_jsonb(existing);
end; $$;

create or replace function public.post_community_message(message_body text, reply_to_message uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin perform public.send_community_message(gen_random_uuid(),message_body,reply_to_message); end; $$;

create or replace function public.edit_community_message(target_message uuid, message_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.community_messages;
declare clean text := btrim(regexp_replace(coalesce(message_body,''), '\s+', ' ', 'g'));
begin
  select * into item from public.community_messages where id=target_message for update;
  if item.id is null or item.author_id<>auth.uid() or not public.community_chat_visible(item) or item.message_kind<>'chat'
    or item.created_at<now()-interval '15 minutes' then raise exception 'Only your normal messages from the last 15 minutes can be edited' using errcode='42501'; end if;
  if exists (select 1 from public.community_members where user_id=auth.uid() and muted_until>now())
    or not coalesce((select room_enabled from public.community_settings where id=1),false) then raise exception 'Posting is paused'; end if;
  if char_length(clean) not between 1 and 240 or clean ~* '(https?://|www\.|t\.me/)' then raise exception 'Use 1–240 characters without links'; end if;
  if clean<>item.body then
    update public.community_messages set body=clean,edited_at=now() where id=target_message returning * into item;
  end if;
  return to_jsonb(item);
end; $$;

create or replace function public.delete_community_message(target_message uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.community_messages;
begin
  select * into item from public.community_messages where id=target_message for update;
  if item.id is null or item.author_id<>auth.uid() or not public.community_chat_visible(item) then raise exception 'Only your visible messages can be deleted' using errcode='42501'; end if;
  update public.community_messages set removed_at=now(),removed_by=auth.uid() where id=target_message;
end; $$;

create or replace function public.remove_community_message(target_message uuid, note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare item public.community_messages;
declare reason text := btrim(coalesce(note,''));
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  if char_length(reason) not between 3 and 280 then raise exception 'A moderation reason of 3–280 characters is required'; end if;
  select * into item from public.community_messages where id=target_message for update;
  if item.id is null then raise exception 'Message unavailable'; end if;
  if exists(select 1 from public.community_audit_log where message_id=target_message and action='message.removed') then return; end if;
  update public.community_messages set removed_at=coalesce(removed_at,now()),removed_by=auth.uid() where id=target_message;
  update public.community_reports set status='actioned',reviewed_by=auth.uid(),reviewed_at=now()
    where message_id=target_message and status='open';
  insert into public.community_audit_log(admin_id,action,target_user_id,message_id,reason)
  values(auth.uid(),'message.removed',item.author_id,target_message,reason);
end; $$;

drop policy if exists community_messages_read on public.community_messages;
create policy community_messages_read on public.community_messages for select to authenticated
using (public.is_community_admin() or public.community_chat_visible(community_messages));
revoke insert, update, delete on public.community_messages from authenticated;

revoke execute on function public.community_chat_page(bigint) from public,anon;
revoke execute on function public.community_chat_state() from public,anon;
revoke execute on function public.send_community_message(uuid,text,uuid,uuid[],uuid) from public,anon;
revoke execute on function public.edit_community_message(uuid,text) from public,anon;
revoke execute on function public.delete_community_message(uuid) from public,anon;
grant execute on function public.community_chat_page(bigint) to authenticated;
grant execute on function public.community_chat_state() to authenticated;
grant execute on function public.send_community_message(uuid,text,uuid,uuid[],uuid) to authenticated;
grant execute on function public.edit_community_message(uuid,text) to authenticated;
grant execute on function public.delete_community_message(uuid) to authenticated;

create or replace function public.community_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'day_key', public.community_today(), 'is_admin', public.is_community_admin(),
    'can_join', public.can_join_community(), 'can_post', public.can_post_community(),
    'chat_v2', true, 'unread', public.community_chat_state(),
    'settings', jsonb_build_object('room_enabled',s.room_enabled,'appreciations_enabled',s.appreciations_enabled,'announcement',s.announcement),
    'muted_until',m.muted_until,'banned_at',m.banned_at,
    'appeal',(select to_jsonb(a) from (select ca.id,ca.user_id,ca.message,ca.status,ca.admin_response,ca.created_at,ca.reviewed_at
      from public.community_appeals ca where ca.user_id=auth.uid() order by ca.created_at desc limit 1) a)
  ) from public.community_settings s left join public.community_members m on m.user_id=auth.uid() where s.id=1;
$$;
commit;
