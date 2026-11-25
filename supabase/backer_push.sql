-- Supabase Snippet Name: YouDO — Backer Claim Push
-- A push to the owner when someone says they supported YouDO, so a claim never
-- waits unseen. Apply after hub_backers.sql, push_dispatch.sql, hub_push.sql
-- and community_push.sql. Safe to re-run. Run the whole query in the SQL
-- Editor (do not save it).
--
-- Only the owner gets it (backer claims are the owner's), behind its own
-- switch: Settings -> Notifications -> Admin Hub -> Backer Claims, synced as
-- push_preferences.admin_backers. The UTR is never put in the push, since it
-- can show on a lock screen. Tapping it opens the Admin Hub.

begin;

alter table public.push_preferences add column if not exists admin_backers boolean not null default true;

-- "₹50", "₹50.5"; other currencies by their code.
create or replace function private.backer_amount(amount numeric, currency text)
returns text language sql immutable set search_path = '' as $$
  select case when pg_catalog.upper(coalesce(currency, 'INR')) = 'INR' then '₹' else pg_catalog.upper(currency) || ' ' end
    || pg_catalog.rtrim(pg_catalog.rtrim(pg_catalog.to_char(coalesce(amount, 0), 'FM9999999990.00'), '0'), '.');
$$;
revoke all on function private.backer_amount(numeric, text) from public, anon, authenticated;

create or replace function private.push_owner_backer_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
declare who text;
begin
  if new.status <> 'pending' then return null; end if;
  select a.user_id into owner_id
  from public.community_admins a
  left join public.push_preferences pp on pp.user_id = a.user_id
  where a.role = 'owner' and a.user_id is distinct from new.user_id and coalesce(pp.admin_backers, true);
  if owner_id is null then return null; end if;
  who := coalesce('@' || nullif(pg_catalog.btrim(new.username), ''),
    case when new.user_id is null then 'Someone' else private.push_handle(new.user_id) end);
  perform private.dispatch_push(array[owner_id], 'New backer claim',
    who || ' says they sent ' || private.backer_amount(new.amount, new.currency) || '. Check your UPI app, then approve it in Admin Hub.',
    pg_catalog.jsonb_build_object('type', 'admin_backer', 'tag', 'admin-backers', 'channel', 'admin-hub'));
  return null;
exception when others then
  -- A push must never stop the claim itself from being saved.
  raise warning 'push_owner_backer_claim skipped: %', sqlerrm;
  return null;
end; $$;
revoke all on function private.push_owner_backer_claim() from public, anon, authenticated;

drop trigger if exists trg_push_owner_backer_claim on public.hub_backers;
create trigger trg_push_owner_backer_claim after insert on public.hub_backers
  for each row execute function private.push_owner_backer_claim();

commit;
