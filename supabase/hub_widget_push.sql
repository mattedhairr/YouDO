-- ==============================================================================
-- YouDO — Room widget live dots (silent pushes)
-- ==============================================================================
-- When someone starts, pauses, resumes or stops a focus session, the phones of
-- the people who share a room with them get a silent push: data only, nothing
-- is shown. It lets the Room widget on the home screen light or clear that
-- person's dot within seconds, even while YouDO is closed. The push carries only
-- what room-mates can already read in focus_status (the state and its times),
-- never the task.
--
-- Apply after hub_focus_status.sql, hub_room_membership.sql and
-- push_dispatch.sql. Rerunnable.
-- ==============================================================================

create or replace function private.push_focus_status_to_rooms()
returns trigger language plpgsql security definer set search_path = '' as $$
declare mates uuid[];
begin
  -- set_focus_status also rewrites unchanged rows; only real changes are sent.
  if tg_op = 'UPDATE' and old.state = new.state
    and old.started_at is not distinct from new.started_at and old.paused_ms = new.paused_ms then
    return null;
  end if;
  select pg_catalog.array_agg(distinct theirs.user_id) into mates
  from public.squad_members mine
  join public.squad_members theirs on theirs.squad_id = mine.squad_id
  where mine.user_id = new.user_id and mine.status = 'accepted'
    and theirs.status = 'accepted' and theirs.user_id <> new.user_id;
  if mates is null then return null; end if;
  perform private.dispatch_push(
    mates,
    'YouDO',
    '',
    pg_catalog.jsonb_build_object(
      'type', 'focus_status',
      'silent', 'true',
      'member', new.user_id::text,
      'state', new.state,
      'started_at', coalesce((extract(epoch from new.started_at) * 1000)::bigint::text, ''),
      'paused_ms', new.paused_ms::text,
      'updated_at', (extract(epoch from new.updated_at) * 1000)::bigint::text
    )
  );
  return null;
end; $$;
revoke all on function private.push_focus_status_to_rooms() from public, anon, authenticated;

drop trigger if exists trg_push_focus_status_to_rooms on public.focus_status;
create trigger trg_push_focus_status_to_rooms
  after insert or update of state, started_at, paused_ms on public.focus_status
  for each row execute function private.push_focus_status_to_rooms();
