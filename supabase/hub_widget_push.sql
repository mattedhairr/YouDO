-- ==============================================================================
-- YouDO — Room widget live dots (silent pushes, widget keys)
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

-- ------------------------------------------------------------------------------
-- Widget keys: a session started on the Up next widget, with YouDO closed, still
-- lights the starter's dot. The app gives each signed-in phone a random key; the
-- server keeps only its SHA-256. The key can do one thing: post that account's
-- focus state. Signing out or switching accounts forgets it, and a key unused
-- for 30 days stops working.
-- ------------------------------------------------------------------------------

create table if not exists public.widget_keys (
  key_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index if not exists widget_keys_user on public.widget_keys (user_id);
alter table public.widget_keys enable row level security;
revoke all on public.widget_keys from public, anon, authenticated;

create or replace function private.widget_key_hash(widget_key text)
returns text language sql immutable set search_path = '' as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(widget_key, 'UTF8')), 'hex');
$$;
revoke all on function private.widget_key_hash(text) from public, anon, authenticated;

-- The signed-in app registers (or keeps alive) this phone's key.
create or replace function public.register_widget_key(widget_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if widget_key is null or widget_key !~ '^[A-Za-z0-9_-]{40,128}$' then raise exception 'Invalid widget key'; end if;
  delete from public.widget_keys where user_id = me and last_used_at < pg_catalog.now() - interval '30 days';
  insert into public.widget_keys (key_hash, user_id) values (private.widget_key_hash(widget_key), me)
    on conflict (key_hash) do update set user_id = excluded.user_id, last_used_at = pg_catalog.now();
  -- A few phones per account; the least recently used go first.
  delete from public.widget_keys where key_hash in (
    select key_hash from public.widget_keys where user_id = me order by last_used_at desc offset 5
  );
end; $$;
revoke execute on function public.register_widget_key(text) from public, anon;
grant execute on function public.register_widget_key(text) to authenticated;

-- Whoever holds a key may cancel it (sign-out runs this after the session ends).
create or replace function public.forget_widget_key(widget_key text)
returns void language sql security definer set search_path = '' as $$
  delete from public.widget_keys where key_hash = private.widget_key_hash(widget_key);
$$;
revoke execute on function public.forget_widget_key(text) from public;
grant execute on function public.forget_widget_key(text) to anon, authenticated;

-- The widget's only write: the key's owner's focus state, with set_focus_status's rules.
create or replace function public.set_focus_status_by_widget(
  widget_key text, next_state text, focus_started_at timestamptz default null, focus_paused_ms bigint default 0
) returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
declare started timestamptz := focus_started_at;
begin
  update public.widget_keys set last_used_at = pg_catalog.now()
    where key_hash = private.widget_key_hash(widget_key)
      and last_used_at > pg_catalog.now() - interval '30 days'
    returning user_id into owner_id;
  if owner_id is null then raise exception 'Unknown widget key' using errcode = '42501'; end if;
  if next_state not in ('idle', 'focusing', 'paused') then raise exception 'Unknown focus state'; end if;
  if next_state = 'idle'
    or started is null
    or started > pg_catalog.now() + interval '2 minutes'
    or started < pg_catalog.now() - interval '24 hours' then
    started := null;
  end if;
  insert into public.focus_status (user_id, state, started_at, paused_ms, updated_at)
    values (
      owner_id,
      case when started is null then 'idle' else next_state end,
      started,
      case when started is null then 0 else greatest(coalesce(focus_paused_ms, 0), 0) end,
      pg_catalog.now()
    )
    on conflict (user_id) do update set
      state = excluded.state, started_at = excluded.started_at,
      paused_ms = excluded.paused_ms, updated_at = excluded.updated_at;
end; $$;
revoke execute on function public.set_focus_status_by_widget(text, text, timestamptz, bigint) from public;
grant execute on function public.set_focus_status_by_widget(text, text, timestamptz, bigint) to anon, authenticated;
