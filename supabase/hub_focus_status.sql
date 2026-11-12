-- ==============================================================================
-- YouDO — Private Hub live focus status
-- ==============================================================================
-- One row per member: idle, focusing or paused, and since when. The app writes
-- it only when a focus session starts, pauses, resumes or stops, so it stays
-- correct while the phone screen is off. Only people who share an accepted
-- room with you can read your row. Nothing about the task itself is stored.
--
-- Apply after full_hub_rooms_setup.sql. Rerunnable.
-- ==============================================================================

begin;

create table if not exists public.focus_status (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state text not null default 'idle' check (state in ('idle', 'focusing', 'paused')),
  started_at timestamptz,
  paused_ms bigint not null default 0 check (paused_ms >= 0),
  updated_at timestamptz not null default now()
);

alter table public.focus_status enable row level security;
revoke all on public.focus_status from anon, authenticated;
grant select on public.focus_status to authenticated;

-- True when the signed-in user and `other` are accepted members of the same room.
create or replace function public.shares_squad_with(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.squad_members mine
    join public.squad_members theirs on theirs.squad_id = mine.squad_id
    where mine.user_id = auth.uid() and mine.status = 'accepted'
      and theirs.user_id = other and theirs.status = 'accepted'
  );
$$;
revoke execute on function public.shares_squad_with(uuid) from public, anon;
grant execute on function public.shares_squad_with(uuid) to authenticated;

drop policy if exists "Room members see focus status" on public.focus_status;
create policy "Room members see focus status" on public.focus_status for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_squad_with(user_id));

-- The only way to write: your own row, with sane times.
create or replace function public.set_focus_status(
  next_state text, focus_started_at timestamptz default null, focus_paused_ms bigint default 0
) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
declare started timestamptz := focus_started_at;
begin
  if me is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if next_state not in ('idle', 'focusing', 'paused') then raise exception 'Unknown focus state'; end if;
  if next_state = 'idle'
    or started is null
    or started > pg_catalog.now() + interval '2 minutes'
    or started < pg_catalog.now() - interval '24 hours' then
    started := null;
  end if;
  insert into public.focus_status (user_id, state, started_at, paused_ms, updated_at)
    values (
      me,
      case when started is null then 'idle' else next_state end,
      started,
      case when started is null then 0 else greatest(coalesce(focus_paused_ms, 0), 0) end,
      pg_catalog.now()
    )
    on conflict (user_id) do update set
      state = excluded.state, started_at = excluded.started_at,
      paused_ms = excluded.paused_ms,
      -- An unchanged status keeps its time: for a paused one that is when the
      -- pause began, which room-mates' clocks stop at.
      updated_at = case
        when public.focus_status.state = excluded.state
          and public.focus_status.started_at is not distinct from excluded.started_at
          and public.focus_status.paused_ms = excluded.paused_ms
        then public.focus_status.updated_at
        else excluded.updated_at
      end;
end; $$;
revoke execute on function public.set_focus_status(text, timestamptz, bigint) from public, anon;
grant execute on function public.set_focus_status(text, timestamptz, bigint) to authenticated;

-- Live updates for room members (RLS still decides who receives each row).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'focus_status'
    ) then
    alter publication supabase_realtime add table public.focus_status;
  end if;
end $$;

commit;
