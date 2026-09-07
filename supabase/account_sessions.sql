-- YouDO account sessions: own-session visibility and guarded remote revocation.
-- Run the whole file once in the Supabase SQL editor. It is safe to rerun.
begin;

create or replace function public.account_sessions()
returns table (
  session_id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  is_current boolean,
  can_revoke boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select
      auth.uid() as user_id,
      nullif(auth.jwt() ->> 'session_id', '')::uuid as session_id
  ), current_session as (
    select s.created_at
    from auth.sessions s
    join caller c on c.user_id = s.user_id and c.session_id = s.id
  )
  select
    s.id,
    s.created_at,
    coalesce(s.refreshed_at, s.updated_at, s.created_at),
    coalesce(s.user_agent, ''),
    s.id = c.session_id,
    s.id <> c.session_id and cs.created_at <= now() - interval '24 hours'
  from auth.sessions s
  cross join caller c
  cross join current_session cs
  where s.user_id = c.user_id
    and (s.not_after is null or s.not_after > now())
  order by (s.id = c.session_id) desc, coalesce(s.refreshed_at, s.updated_at, s.created_at) desc;
$$;

create or replace function public.revoke_account_session(target_session uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := auth.uid();
declare caller_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
declare caller_created_at timestamptz;
declare removed integer;
begin
  if caller_id is null or caller_session is null then
    raise exception 'Sign in again to manage devices' using errcode = '42501';
  end if;
  if target_session is null or target_session = caller_session then
    raise exception 'The current device cannot be removed here' using errcode = '22023';
  end if;

  select s.created_at into caller_created_at
  from auth.sessions s
  where s.id = caller_session and s.user_id = caller_id
  for update;

  if caller_created_at is null then
    raise exception 'Current session is no longer active' using errcode = '42501';
  end if;
  if caller_created_at > now() - interval '24 hours' then
    raise exception 'Remote sign-out unlocks after this device has been signed in for 24 hours' using errcode = '42501';
  end if;

  delete from auth.sessions s where s.id = target_session and s.user_id = caller_id;
  get diagnostics removed = row_count;
  return removed = 1;
end;
$$;

revoke all on function public.account_sessions() from public, anon;
revoke all on function public.revoke_account_session(uuid) from public, anon;
grant execute on function public.account_sessions() to authenticated;
grant execute on function public.revoke_account_session(uuid) to authenticated;

commit;
