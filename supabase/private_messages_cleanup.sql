-- Supabase Snippet Name: YouDO — Private Messages Cleanup
-- Run AFTER supabase/hub_private_rooms.sql (creates direct_messages / squad_messages).
--
-- This is the ONLY place private 24h pruning should live: it extends prune_community_history()
-- already used by community chat on main. Running hub_private_rooms.sql alone does NOT prune;
-- running this file twice is OK (replaces the function + rebinds triggers).
-- If you previously ran an older hub SQL with prune_private_messages(), run hub_private_fixup.sql first.

create or replace function public.prune_community_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 1. Prune Community Chat (7-day moderation retention after 24h UI expiry)
  delete from public.community_messages cm where expires_at < now() - interval '7 days'
    and not exists (select 1 from public.community_reports r where r.message_id = cm.id and r.status = 'open');
  
  -- 2. Prune Board Appreciations (31 days)
  delete from public.board_appreciations where day_key < (now() at time zone 'UTC')::date - 31;

  -- 3. Prune Private Hub DMs (Hard delete after 24 hours to save storage)
  delete from public.direct_messages where created_at < now() - interval '24 hours';
  
  -- 4. Prune Private Hub Squad Messages (Hard delete after 24 hours to save storage)
  delete from public.squad_messages where created_at < now() - interval '24 hours';

  return null;
end; $$;

-- Attach the trigger to our new tables so they actively trigger the cleanup in the background
drop trigger if exists prune_after_dm on public.direct_messages;
create trigger prune_after_dm after insert on public.direct_messages
  for each statement execute function public.prune_community_history();

drop trigger if exists prune_after_squad_msg on public.squad_messages;
create trigger prune_after_squad_msg after insert on public.squad_messages
  for each statement execute function public.prune_community_history();
