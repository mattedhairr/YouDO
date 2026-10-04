-- YouDO Private Hub — one-time fix if you ran the OLD hub_private_rooms.sql with prune_private_messages()

alter table public.profiles add column if not exists avatar_url text;
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
