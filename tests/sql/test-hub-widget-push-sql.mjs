// Isolated PostgreSQL checks for hub_widget_push.sql: a focus change sends one
// silent push to the people who share a room, and nothing else.
// pg_net is replaced by a recorder; nothing is sent.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SUPABASE_SETUP_ORDER } from '../../scripts/supabase-setup-order.mjs';

const db = new PGlite();
const id = (n) => `50000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
let checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; };
const sent = async () => (await rows('select body from net.calls order by id')).map((row) => row.body);
const clear = () => db.exec('delete from net.calls');

try {
  const harness = (await readFile(new URL('./test-full-setup-sql.mjs', import.meta.url), 'utf8')).match(/await db\.exec\(`([\s\S]*?)`\);/)[1]
    .replace(/create function net\.http_post[\s\S]*?\$\$select 1::bigint\$\$;/, '');
  await db.exec(harness);
  await db.exec(`create table net.calls(id serial primary key, body jsonb);
    create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
      returns bigint language sql as $$insert into net.calls(body) values(body) returning id$$;`);
  const load = async (name) => (await readFile(new URL(`../../supabase/${name}.sql`, import.meta.url), 'utf8'))
    .replace('create extension if not exists pgcrypto;', '')
    .replace('create extension if not exists pg_net with schema extensions;', '');
  for (const name of SUPABASE_SETUP_ORDER) await db.exec(await load(name));
  await db.exec(await load('hub_widget_push'));
  check(true, 'hub_widget_push.sql is rerunnable on a full project');

  await db.query("insert into vault.decrypted_secrets values('project_url','https://example.supabase.co'),('push_webhook_secret',$1) on conflict do nothing", ['s'.repeat(64)]);
  const people = ['asha', 'ben', 'chen', 'dev', 'esa'];
  for (let n = 1; n <= people.length; n++) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [id(n), `${people[n - 1]}@example.com`]);
    await db.query('insert into public.profiles(id,username,display_name) values($1,$2,$3) on conflict (id) do update set username=excluded.username', [id(n), people[n - 1], people[n - 1]]);
  }
  // Asha shares one room with Ben and Chen and another with Ben; Dev is only invited; Esa is elsewhere.
  await db.query("insert into public.squads(id,name,created_by) values($1,'Morning Writers',$2),($3,'Night Owls',$2)", [id(90), id(1), id(91)]);
  for (const [room, user, status] of [[90, 1, 'accepted'], [90, 2, 'accepted'], [90, 3, 'accepted'], [90, 4, 'invited'], [91, 1, 'accepted'], [91, 2, 'accepted']]) {
    await db.query('insert into public.squad_members(squad_id,user_id,status) values($1,$2,$3)', [id(room), id(user), status]);
  }
  await clear();

  await db.query("insert into public.focus_status(user_id,state,started_at,paused_ms) values($1,'focusing','2026-10-28T09:00:00Z',0)", [id(1)]);
  let calls = await sent();
  check(calls.length === 1, 'starting a session sends one push');
  check([...calls[0].userIds].sort().join() === [id(2), id(3)].join(), 'to each room-mate once, never to the invited, the sender or outsiders');
  check(calls[0].data.silent === 'true' && calls[0].data.type === 'focus_status', 'it is a silent widget refresh');
  check(calls[0].data.member === id(1) && calls[0].data.state === 'focusing', 'it says who changed and to what');
  check(calls[0].data.started_at === String(Date.parse('2026-10-28T09:00:00Z')), 'start time is epoch milliseconds');
  check(!('task' in calls[0].data) && !('from' in calls[0].data), 'it carries no task and no FCM-reserved keys');

  await clear();
  await db.query('update public.focus_status set updated_at=now() where user_id=$1', [id(1)]);
  await db.query("update public.focus_status set state='focusing' where user_id=$1", [id(1)]);
  check((await sent()).length === 0, 'rewriting the same state sends nothing');

  await db.query("update public.focus_status set state='paused', paused_ms=60000 where user_id=$1", [id(1)]);
  await db.query("update public.focus_status set state='idle', started_at=null, paused_ms=0 where user_id=$1", [id(1)]);
  calls = await sent();
  check(calls.length === 2 && calls[1].data.state === 'idle' && calls[1].data.started_at === '', 'pause and stop each send one');

  await clear();
  await db.query("insert into public.focus_status(user_id,state,started_at) values($1,'focusing',now())", [id(5)]);
  check((await sent()).length === 0, 'someone with no room-mates sends nothing');

  // Widget keys: one phone's key posts only its owner's focus state.
  const as = async (n) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [n ? id(n) : '']);
    await db.exec(n ? 'set role authenticated' : 'set role anon');
  };
  const fails = async (sql, args) => { try { await db.query(sql, args); return false; } catch { return true; } };
  const key = 'k'.repeat(43);
  await as(0);
  check(await fails('select public.register_widget_key($1)', [key]), 'registering a key needs sign-in');
  await as(2);
  check(await fails('select public.register_widget_key($1)', ['short']), 'a weak key is refused');
  await db.query('select public.register_widget_key($1)', [key]);
  await db.exec('reset role');
  const stored = await rows('select key_hash, user_id from public.widget_keys');
  check(stored.length === 1 && stored[0].user_id === id(2) && stored[0].key_hash !== key && stored[0].key_hash.length === 64, "only the key's SHA-256 is kept, for its owner");
  await as(2);
  check(await fails('select * from public.widget_keys', []), 'apps cannot read the keys');

  await db.exec('reset role');
  await clear();
  await as(0);
  await db.query("select public.set_focus_status_by_widget($1,'focusing',now(),0)", [key]);
  await db.exec('reset role');
  check((await rows('select state from public.focus_status where user_id=$1', [id(2)]))[0]?.state === 'focusing', "the widget posts its owner's focus with the key alone");
  check((await sent()).some((call) => call.data.member === id(2)), 'and room-mates get the silent push');
  await as(0);
  check(await fails("select public.set_focus_status_by_widget($1,'focusing',now(),0)", ['x'.repeat(43)]), 'an unknown key posts nothing');
  check(await fails("select public.set_focus_status_by_widget($1,'sleeping',now(),0)", [key]), 'an unknown state is refused');
  await db.query("select public.set_focus_status_by_widget($1,'focusing',now() - interval '2 days',0)", [key]);
  await db.exec('reset role');
  check((await rows('select state from public.focus_status where user_id=$1', [id(2)]))[0].state === 'idle', 'a start time over a day old counts as stopped');

  await db.exec("update public.widget_keys set last_used_at = now() - interval '31 days'");
  await as(0);
  check(await fails("select public.set_focus_status_by_widget($1,'focusing',now(),0)", [key]), 'a key unused for 30 days stops working');
  await db.exec('reset role');
  await db.exec('update public.widget_keys set last_used_at = now()');
  await as(0);
  await db.query('select public.forget_widget_key($1)', [key]);
  check(await fails("select public.set_focus_status_by_widget($1,'focusing',now(),0)", [key]), 'a forgotten key (sign-out) stops working');
  await db.exec('reset role');

  console.log(`PASS: ${checks} isolated PostgreSQL checks for Room widget silent pushes and widget keys.`);
} finally {
  await db.close();
}
