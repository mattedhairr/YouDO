-- Supabase Snippet Name: YouDO — Board Update Push
-- Apply after push_dispatch.sql, hub_push.sql and community_chat.sql. Rerunnable.
-- Run the whole query once in the private Supabase SQL Editor (do not save it).
--
-- A Board update (community_settings.announcement) can be pushed to every Board
-- member, but only when an admin confirms "Notify everyone?" after publishing:
-- a typo fix never buzzes anyone. Each published version is pushed at most
-- once. Clearing the update never pushes. Members can turn these off in
-- Settings -> Notifications -> Board updates (push_preferences.board_updates).

begin;

alter table public.push_preferences add column if not exists board_updates boolean not null default true;
alter table public.community_settings add column if not exists announcement_pushed_revision bigint not null default 0;

create or replace function public.notify_community_update()
returns integer language plpgsql security definer set search_path = '' as $$
declare settings public.community_settings;
declare recipients uuid[];
declare first_line text;
declare total integer;
declare offset_at integer := 0;
begin
  if not public.is_community_owner() then raise exception 'Owner required' using errcode='42501'; end if;
  select * into settings from public.community_settings where id=1 for update;
  if settings.id is null or pg_catalog.btrim(coalesce(settings.announcement,'')) = '' then
    raise exception 'There is no update to send';
  end if;
  -- This version was already pushed: never twice.
  if settings.announcement_pushed_revision >= settings.announcement_revision then return 0; end if;
  update public.community_settings set announcement_pushed_revision=settings.announcement_revision where id=1;

  first_line := pg_catalog.btrim(pg_catalog.split_part(settings.announcement, E'\n', 1));
  select coalesce(pg_catalog.array_agg(p.user_id), '{}'::uuid[]) into recipients
    from public.public_pace p
    where p.user_id <> auth.uid()
      and public.can_join_community(p.user_id)
      and coalesce((select pp.board_updates from public.push_preferences pp where pp.user_id=p.user_id), true)
      and exists (select 1 from public.user_push_tokens t where t.user_id=p.user_id);
  total := coalesce(pg_catalog.cardinality(recipients), 0);

  -- send-push takes at most 500 people per request.
  while offset_at < total loop
    perform private.dispatch_push(
      recipients[offset_at + 1 : offset_at + 500],
      'YouDO Board update',
      first_line,
      pg_catalog.jsonb_build_object('type', 'board_update', 'channel', 'public-hub', 'tag', 'board-update')
    );
    offset_at := offset_at + 500;
  end loop;

  insert into public.community_audit_log(admin_id, action, reason)
    values (auth.uid(), 'settings.announcement.pushed', total || ' members notified');
  return total;
end; $$;

revoke execute on function public.notify_community_update() from public, anon;
grant execute on function public.notify_community_update() to authenticated;

commit;
