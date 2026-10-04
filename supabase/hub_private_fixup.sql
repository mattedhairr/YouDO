-- YouDO Private Hub — one-time fix if you ran the OLD hub_private_rooms.sql with prune_private_messages()

alter table public.profiles add column if not exists avatar_url text;

create or replace function public.is_accepted_squad_member(p_squad_id uuid, p_user_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id and user_id = p_user_id and status = 'accepted'
  );
$$;

create or replace function public.is_squad_admin(p_squad_id uuid, p_user_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id and user_id = p_user_id and role = 'admin' and status = 'accepted'
  );
$$;

drop policy if exists "Users view squads they are in" on public.squads;
create policy "Users view squads they are in" on public.squads for select using (
  auth.uid() = created_by
  or public.is_accepted_squad_member(squads.id, auth.uid())
);

drop policy if exists "Users view members of their squads" on public.squad_members;
create policy "Users view members of their squads" on public.squad_members for select using (
  auth.uid() = user_id
  or public.is_accepted_squad_member(squad_members.squad_id, auth.uid())
  or public.is_squad_admin(squad_members.squad_id, auth.uid())
);

drop policy if exists "Squad messages viewable only by accepted members" on public.squad_messages;
create policy "Squad messages viewable only by accepted members" on public.squad_messages for select using (
  public.is_accepted_squad_member(squad_messages.squad_id, auth.uid())
);

drop policy if exists "Squad members can post messages" on public.squad_messages;
create policy "Squad members can post messages" on public.squad_messages for insert with check (
  auth.uid() = sender_id
  and public.is_accepted_squad_member(squad_messages.squad_id, auth.uid())
);

drop policy if exists "Members can leave or admins can remove" on public.squad_members;
create policy "Members can leave or admins can remove" on public.squad_members for delete using (
  auth.uid() = user_id
  or public.is_squad_admin(squad_members.squad_id, auth.uid())
);
-- Safe to run after both hub_private_rooms.sql and private_messages_cleanup.sql were applied.

drop trigger if exists prune_after_dm on public.direct_messages;
drop trigger if exists prune_after_squad_msg on public.squad_messages;
drop function if exists public.prune_private_messages();

-- Re-attach private pruning to the shared community cleanup function (see private_messages_cleanup.sql)
-- \i private_messages_cleanup.sql  — or paste/run that file in the Supabase SQL editor.

-- RLS deletes (skip any line that errors with "policy already exists")
drop policy if exists "Participants can delete friendships" on public.friendships;
create policy "Participants can delete friendships" on public.friendships for delete using (
  auth.uid() = requester_id or auth.uid() = receiver_id
);

drop policy if exists "Senders can delete own DMs" on public.direct_messages;
create policy "Senders can delete own DMs" on public.direct_messages for delete using (
  auth.uid() = sender_id
);

drop policy if exists "Receivers can mark DMs read" on public.direct_messages;
create policy "Receivers can mark DMs read" on public.direct_messages for update using (
  auth.uid() = receiver_id
) with check (auth.uid() = receiver_id);

drop policy if exists "Senders can delete own squad messages" on public.squad_messages;
create policy "Senders can delete own squad messages" on public.squad_messages for delete using (
  auth.uid() = sender_id
);

drop policy if exists "Members can leave or admins can remove" on public.squad_members;
create policy "Members can leave or admins can remove" on public.squad_members for delete using (
  auth.uid() = user_id
  or exists (
    select 1 from public.squad_members sm
    where sm.squad_id = squad_members.squad_id
      and sm.user_id = auth.uid()
      and sm.role = 'admin'
      and sm.status = 'accepted'
  )
);

alter table public.friendships add column if not exists request_message text not null default '';

-- Discover list: public squads the viewer is not already in (bypasses member-only squad SELECT).
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

revoke all on function public.discover_squads() from public;
grant execute on function public.discover_squads() to authenticated;

-- Squads the viewer has asked to join (pending) — readable even though they are not accepted members yet.
create or replace function public.my_pending_squad_joins()
returns setof public.squads
language sql
security definer
stable
set search_path = public
as $$
  select s.*
  from public.squad_members sm
  join public.squads s on s.id = sm.squad_id
  where sm.user_id = auth.uid()
    and sm.status = 'pending';
$$;

revoke all on function public.my_pending_squad_joins() from public;
grant execute on function public.my_pending_squad_joins() to authenticated;

drop policy if exists "Users update own squad membership" on public.squad_members;
create policy "Users update own squad membership" on public.squad_members for update using (auth.uid() = user_id);

drop policy if exists "Squad admins update members" on public.squad_members;
create policy "Squad admins update members" on public.squad_members for update using (
  public.is_squad_admin(squad_members.squad_id, auth.uid())
);

-- Realtime (run once per project; ignore "already member of publication" if re-run)
do $$
begin
  alter publication supabase_realtime add table public.squad_members;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception
  when duplicate_object then null;
end $$;
