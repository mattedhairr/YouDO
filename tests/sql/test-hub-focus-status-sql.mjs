// Isolated PostgreSQL contract tests for live focus status in Private Hub rooms.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const id = (n) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const as = async (user) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ? id(user) : '']);
  await db.exec(user ? 'set role authenticated' : 'set role anon');
};
const fails = async (sql, args, label) => {
  let failed = false;
  try { await db.query(sql, args); } catch { failed = true; }
  check(failed, label);
};

try {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create publication supabase_realtime;
  `);
  for (const name of ['user_backups', 'cloud_backup_revisions', 'public_pace', 'board_evidence', 'full_hub_rooms_setup', 'hub_room_membership']) {
    await db.exec((await readFile(new URL(`../../supabase/${name}.sql`, import.meta.url), 'utf8')).replace('create extension if not exists pgcrypto;', ''));
  }
  const migration = await readFile(new URL('../../supabase/hub_focus_status.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  check(true, 'focus status migration is rerunnable');
  check((await rows("select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='focus_status'")).length === 1, 'focus status streams over Realtime');

  for (let n = 1; n <= 4; n++) await db.query('insert into auth.users values ($1)', [id(n)]);
  const ROOM = '60000000-0000-4000-8000-0000000000a1';
  await db.exec('reset role');
  await db.query("insert into public.squads(id,name,privacy,created_by) values ($1,'Room','invite_only',$2)", [ROOM, id(1)]);
  await db.query("insert into public.squad_members(squad_id,user_id,role,status) values ($1,$2,'admin','accepted'),($1,$3,'member','accepted'),($1,$4,'member','invited')", [ROOM, id(1), id(2), id(3)]);

  // Writing: only your own row, only through the function.
  await as(2);
  await rows("select public.set_focus_status('focusing', now() - interval '25 minutes', 60000)");
  await fails("insert into public.focus_status(user_id,state) values ($1,'focusing')", [id(1)], 'nobody writes focus status directly');
  await fails("update public.focus_status set state='idle'", [], 'nobody updates focus status directly');
  await fails("select public.set_focus_status('sleeping')", [], 'unknown states are refused');

  // Reading: yourself and accepted room-mates only.
  await as(1);
  const seen = await rows('select user_id, state, paused_ms from public.focus_status');
  check(seen.length === 1 && seen[0].user_id === id(2) && seen[0].state === 'focusing' && Number(seen[0].paused_ms) === 60000, 'a room-mate sees a member focusing');
  await as(3);
  check((await rows('select * from public.focus_status')).length === 0, 'an invited, not yet accepted, person sees nothing');
  await as(4);
  check((await rows('select * from public.focus_status')).length === 0, 'outsiders see nothing');
  await as(null);
  await fails('select * from public.focus_status', [], 'anonymous users cannot read focus status');

  // Times are sanity-checked: no future or day-old sessions.
  await as(2);
  await rows("select public.set_focus_status('focusing', now() + interval '1 hour', 0)");
  check((await rows('select state, started_at from public.focus_status where user_id=$1', [id(2)]))[0].state === 'idle', 'a start time in the future reads as idle');
  await rows("select public.set_focus_status('paused', now() - interval '30 hours', 0)");
  check((await rows('select state from public.focus_status where user_id=$1', [id(2)]))[0].state === 'idle', 'a day-old start time reads as idle');
  await rows("select public.set_focus_status('paused', now() - interval '10 minutes', 120000)");
  check((await rows('select state from public.focus_status where user_id=$1', [id(2)]))[0].state === 'paused', 'pausing is shared');
  // Sending the same pause again (an app reload, another device) keeps when it began.
  const pausedRow = (await rows('select started_at from public.focus_status where user_id=$1', [id(2)]))[0];
  await db.exec('reset role');
  await db.query("update public.focus_status set updated_at = now() - interval '7 minutes' where user_id=$1", [id(2)]);
  await as(2);
  await rows('select public.set_focus_status($1, $2, $3)', ['paused', pausedRow.started_at, 120000]);
  await db.exec('reset role');
  check((await rows("select now() - updated_at > interval '6 minutes' as kept from public.focus_status where user_id=$1", [id(2)]))[0].kept, 'an unchanged status keeps its time (the pause start)');
  await as(2);
  await rows('select public.set_focus_status($1, $2, $3)', ['focusing', pausedRow.started_at, 300000]);
  await db.exec('reset role');
  check((await rows("select now() - updated_at < interval '1 minute' as fresh from public.focus_status where user_id=$1", [id(2)]))[0].fresh, 'a real change (resuming) takes a new time');
  await as(2);
  await rows("select public.set_focus_status('idle', now(), 5000)");
  const idle = (await rows('select state, started_at, paused_ms from public.focus_status where user_id=$1', [id(2)]))[0];
  check(idle.state === 'idle' && idle.started_at === null && Number(idle.paused_ms) === 0, 'stopping clears the session details');

  // Leaving a room stops sharing with it.
  await rows("select public.set_focus_status('focusing', now() - interval '5 minutes', 0)");
  await db.query('delete from public.squad_members where squad_id=$1 and user_id=$2', [ROOM, id(2)]);
  await as(1);
  check((await rows('select * from public.focus_status where user_id=$1', [id(2)])).length === 0, 'after leaving, former room-mates no longer see the status');

  console.log(`PASS: ${checks} isolated PostgreSQL checks for live focus status (own writes only, room-mates only, sane times).`);
} finally {
  await db.close();
}
