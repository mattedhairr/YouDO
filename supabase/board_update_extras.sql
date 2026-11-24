-- Supabase Snippet Name: YouDO — Board Update Extras
-- Apply after community_chat.sql and board_update_push.sql. Rerunnable.
-- Run the whole query once in the private Supabase SQL Editor (do not save it).
--
-- A Board update (community_settings.announcement) can carry:
--   * a poll: 2-6 options, one choice per member (changeable until the admin
--     ends it); results show after voting, once ended, and to admins;
--   * quick reactions: one of five emoji per member, counts for everyone;
--   * "Reply privately": one short reply per member, read only by admins;
--   * one action button: "Check for updates" in the app, or a link to YouDO's
--     GitHub or Telegram.
-- Everything belongs to the update's revision: publishing a new or changed
-- update starts fresh votes, reactions and replies.

begin;

alter table public.community_settings add column if not exists announcement_poll jsonb;
alter table public.community_settings add column if not exists announcement_poll_closed boolean not null default false;
alter table public.community_settings add column if not exists announcement_replies boolean not null default false;
alter table public.community_settings add column if not exists announcement_action jsonb;

create table if not exists public.community_update_votes (
  revision bigint not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  choice smallint not null check (choice between 0 and 5),
  created_at timestamptz not null default now(),
  primary key (revision, user_id)
);
create table if not exists public.community_update_reactions (
  revision bigint not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '🔥', '🎉', '🙏')),
  created_at timestamptz not null default now(),
  primary key (revision, user_id)
);
create table if not exists public.community_update_replies (
  revision bigint not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  primary key (revision, user_id)
);
-- Only the functions below read or write these tables.
alter table public.community_update_votes enable row level security;
alter table public.community_update_reactions enable row level security;
alter table public.community_update_replies enable row level security;
revoke all on public.community_update_votes, public.community_update_reactions, public.community_update_replies
  from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- Admin: publish (or clear) the update together with its extras.
-- ------------------------------------------------------------------------------
create or replace function public.publish_community_update(
  next_announcement text,
  poll_options text[] default null,
  allow_replies boolean default false,
  action_kind text default null,
  action_label text default null,
  action_url text default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare current_settings public.community_settings%rowtype;
declare clean_text text := pg_catalog.btrim(coalesce(next_announcement, ''));
declare options text[] := '{}';
declare option_text text;
declare next_poll jsonb;
declare next_action jsonb;
declare clean_label text := pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(action_label, ''), '\s+', ' ', 'g'));
declare clean_url text := pg_catalog.btrim(coalesce(action_url, ''));
declare next_replies boolean := coalesce(allow_replies, false);
declare next_revision bigint;
begin
  if not public.is_community_owner() then raise exception 'Owner required' using errcode='42501'; end if;
  if pg_catalog.char_length(clean_text) > 2000 then raise exception 'Keep the update under 2000 characters'; end if;

  if clean_text <> '' and poll_options is not null then
    foreach option_text in array poll_options loop
      option_text := pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(option_text, ''), '\s+', ' ', 'g'));
      if option_text = '' then continue; end if;
      if pg_catalog.char_length(option_text) > 60 then raise exception 'Keep each poll option under 60 characters'; end if;
      if pg_catalog.lower(option_text) = any (select pg_catalog.lower(o) from pg_catalog.unnest(options) o) then
        raise exception 'Poll options must be different';
      end if;
      options := options || option_text;
    end loop;
    if pg_catalog.cardinality(options) > 0 then
      if pg_catalog.cardinality(options) not between 2 and 6 then raise exception 'A poll needs 2 to 6 options'; end if;
      next_poll := pg_catalog.to_jsonb(options);
    end if;
  end if;

  if clean_text <> '' and action_kind is not null then
    if action_kind not in ('updater', 'link') then raise exception 'Unknown action button'; end if;
    if clean_label = '' then clean_label := case when action_kind = 'updater' then 'Check for updates' else 'Open' end; end if;
    if pg_catalog.char_length(clean_label) > 24 then raise exception 'Keep the button label under 24 characters'; end if;
    if action_kind = 'link' and clean_url !~ '^https://(github\.com/mattedhairr/YouDO(/[^\s]*)?|t\.me/[A-Za-z0-9_+/-]+)$' then
      raise exception 'Links can only open YouDO on GitHub or Telegram';
    end if;
    next_action := pg_catalog.jsonb_build_object('kind', action_kind, 'label', clean_label)
      || case when action_kind = 'link' then pg_catalog.jsonb_build_object('url', clean_url) else '{}'::jsonb end;
  end if;
  if clean_text = '' then next_replies := false; end if;

  select * into current_settings from public.community_settings where id=1 for update;
  if current_settings.announcement is not distinct from clean_text
    and current_settings.announcement_poll is not distinct from next_poll
    and current_settings.announcement_replies is not distinct from next_replies
    and current_settings.announcement_action is not distinct from next_action then
    return current_settings.announcement_revision;
  end if;

  update public.community_settings set
    announcement=clean_text,
    announcement_poll=next_poll,
    announcement_poll_closed=false,
    announcement_replies=next_replies,
    announcement_action=next_action,
    announcement_revision=announcement_revision + 1,
    announcement_updated_at=now(),
    updated_by=auth.uid(), updated_at=now()
  where id=1
  returning announcement_revision into next_revision;
  -- The admin has read what they just published.
  update public.community_read_state set updates_read_revision=next_revision where user_id=auth.uid();
  insert into public.community_audit_log(admin_id, action)
    values (auth.uid(), case when clean_text='' then 'settings.announcement.cleared' else 'settings.announcement.published' end);
  return next_revision;
end; $$;

create or replace function public.close_community_poll()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_community_owner() then raise exception 'Owner required' using errcode='42501'; end if;
  update public.community_settings set announcement_poll_closed=true, updated_at=now()
    where id=1 and announcement_poll is not null and not announcement_poll_closed;
  if found then insert into public.community_audit_log(admin_id, action) values (auth.uid(), 'settings.announcement.poll_closed'); end if;
end; $$;

create or replace function public.admin_community_update_replies()
returns table(user_id uuid, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_community_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  return query select r.user_id, r.body, r.created_at from public.community_update_replies r
    where r.revision=(select s.announcement_revision from public.community_settings s where s.id=1)
    order by r.created_at desc;
end; $$;

-- ------------------------------------------------------------------------------
-- Members: what the current update carries, and their own answers.
-- ------------------------------------------------------------------------------
create or replace function public.community_update_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.community_settings;
declare me uuid := auth.uid();
declare admin boolean := public.is_community_admin();
declare my_choice smallint;
declare my_emoji text;
declare counts jsonb;
declare total bigint;
begin
  if me is null or not (admin or public.can_join_community(me)) then return null; end if;
  select * into s from public.community_settings where id=1;
  if s.id is null or pg_catalog.btrim(s.announcement) = '' then return null; end if;
  select v.choice into my_choice from public.community_update_votes v where v.revision=s.announcement_revision and v.user_id=me;
  select r.emoji into my_emoji from public.community_update_reactions r where r.revision=s.announcement_revision and r.user_id=me;
  if s.announcement_poll is not null then
    select coalesce(pg_catalog.jsonb_agg(coalesce(c.n, 0) order by i.idx), '[]'::jsonb), coalesce(pg_catalog.sum(c.n), 0)
      into counts, total
      from pg_catalog.generate_series(0, pg_catalog.jsonb_array_length(s.announcement_poll) - 1) as i(idx)
      left join (
        select v.choice, pg_catalog.count(*) as n from public.community_update_votes v
        where v.revision=s.announcement_revision group by v.choice
      ) c on c.choice=i.idx;
  end if;
  return pg_catalog.jsonb_build_object(
    'revision', s.announcement_revision,
    'poll', case when s.announcement_poll is null then null else pg_catalog.jsonb_build_object(
      'options', s.announcement_poll,
      'closed', s.announcement_poll_closed,
      'my_choice', my_choice,
      -- Results after voting, once ended, or for admins: no herd voting.
      'counts', case when my_choice is not null or s.announcement_poll_closed or admin then counts else null end,
      'total', total
    ) end,
    'reactions', coalesce((
      select pg_catalog.jsonb_object_agg(r.emoji, r.n) from (
        select x.emoji, pg_catalog.count(*) as n from public.community_update_reactions x
        where x.revision=s.announcement_revision group by x.emoji
      ) r
    ), '{}'::jsonb),
    'my_reaction', my_emoji,
    'replies', s.announcement_replies,
    'replied', exists(select 1 from public.community_update_replies r where r.revision=s.announcement_revision and r.user_id=me),
    'action', s.announcement_action
  );
end; $$;

create or replace function public.vote_community_update(option_index smallint)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.community_settings;
begin
  if not public.can_join_community() then raise exception 'Board membership required' using errcode='42501'; end if;
  select * into s from public.community_settings where id=1;
  if s.announcement_poll is null or pg_catalog.btrim(s.announcement) = '' then raise exception 'There is no poll right now'; end if;
  if s.announcement_poll_closed then raise exception 'This poll has ended'; end if;
  if option_index is null or option_index < 0 or option_index >= pg_catalog.jsonb_array_length(s.announcement_poll) then raise exception 'Unknown poll option'; end if;
  insert into public.community_update_votes(revision, user_id, choice) values (s.announcement_revision, auth.uid(), option_index)
    on conflict (revision, user_id) do update set choice=excluded.choice, created_at=now();
end; $$;

create or replace function public.react_community_update(reaction text)
returns void language plpgsql security definer set search_path = '' as $$
declare rev bigint;
begin
  if not public.can_join_community() then raise exception 'Board membership required' using errcode='42501'; end if;
  select s.announcement_revision into rev from public.community_settings s where s.id=1 and pg_catalog.btrim(s.announcement) <> '';
  if rev is null then raise exception 'There is no update right now'; end if;
  if reaction is null or reaction = '' then
    delete from public.community_update_reactions r where r.revision=rev and r.user_id=auth.uid();
    return;
  end if;
  insert into public.community_update_reactions(revision, user_id, emoji) values (rev, auth.uid(), reaction)
    on conflict (revision, user_id) do update set emoji=excluded.emoji, created_at=now();
end; $$;

create or replace function public.reply_community_update(reply_text text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.community_settings;
declare clean_body text := pg_catalog.btrim(coalesce(reply_text, ''));
begin
  if not public.can_join_community() then raise exception 'Board membership required' using errcode='42501'; end if;
  select * into s from public.community_settings where id=1;
  if not s.announcement_replies or pg_catalog.btrim(s.announcement) = '' then raise exception 'Replies are closed for this update'; end if;
  if pg_catalog.char_length(clean_body) not between 1 and 500 then raise exception 'Write a reply of up to 500 characters'; end if;
  insert into public.community_update_replies(revision, user_id, body) values (s.announcement_revision, auth.uid(), clean_body)
    on conflict (revision, user_id) do update set body=excluded.body, created_at=now();
end; $$;

revoke execute on function public.publish_community_update(text, text[], boolean, text, text, text) from public, anon;
revoke execute on function public.close_community_poll() from public, anon;
revoke execute on function public.admin_community_update_replies() from public, anon;
revoke execute on function public.community_update_state() from public, anon;
revoke execute on function public.vote_community_update(smallint) from public, anon;
revoke execute on function public.react_community_update(text) from public, anon;
revoke execute on function public.reply_community_update(text) from public, anon;
grant execute on function public.publish_community_update(text, text[], boolean, text, text, text) to authenticated;
grant execute on function public.close_community_poll() to authenticated;
grant execute on function public.admin_community_update_replies() to authenticated;
grant execute on function public.community_update_state() to authenticated;
grant execute on function public.vote_community_update(smallint) to authenticated;
grant execute on function public.react_community_update(text) to authenticated;
grant execute on function public.reply_community_update(text) to authenticated;

commit;
