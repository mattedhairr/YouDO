// Isolated PostgreSQL verification. No network or production credentials.
// Run: node scripts/test-board-evidence-sql.mjs
import { PGlite } from '../node_modules/.cache/community-db-test/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const file = (name) => readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
const as = async (n) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [n ? uid(n) : '']);
  await db.exec('set role authenticated');
};
const denied = async (sql, args = []) => {
  await assert.rejects(() => db.query(sql, args), `Expected denial: ${sql}`);
};
const session = (id, start, end, net, pauses = []) => ({
  id, startTime: start, endTime: end, netFocusMs: net,
  pausedDuration: end - start - net, pauses,
});
const backup = (sessions) => JSON.stringify({ tasks: [], goals: [], sessionHistory: { test: sessions } });

try {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    alter default privileges in schema public grant all on tables to authenticated;
    alter default privileges in schema public grant usage, select on sequences to authenticated;
  `);
  await db.exec(await file('user_backups.sql'));
  await db.exec(await file('cloud_backup_revisions.sql'));
  await db.exec(await file('public_pace.sql'));
  await db.exec((await file('community.sql')).replace('create extension if not exists pgcrypto;', ''));
  await db.exec(await file('community_hashtags.sql'));
  await db.query('insert into auth.users(id) values($1)', [uid(99)]);
  await db.query(`insert into public.public_pace(user_id,display_name,today_ms,week_ms,month_ms)
    values($1,'Existing member',123000,123000,123000)`, [uid(99)]);
  const migration = await file('board_evidence.sql');
  await db.exec(migration);
  await db.exec(migration);
  assert.equal(Number((await query('select today_ms from public.public_pace where user_id=$1', [uid(99)]))[0].today_ms), 123000,
    'migration preserves existing public columns');

  for (let n = 1; n <= 11; n++) {
    await db.query('insert into auth.users(id) values ($1)', [uid(n)]);
    await db.query('insert into public.public_pace(user_id,display_name) values ($1,$2)', [uid(n), `Tester ${n}`]);
  }
  await as(99);
  await db.query('update public.public_pace set today_ms=999999999 where user_id=$1', [uid(99)]);
  assert.equal(Number((await query('select today_ms from public.public_pace where user_id=$1', [uid(99)]))[0].today_ms), 123000,
    'new client writes cannot change retained legacy totals');
  assert.equal(Number((await query("select today_ms from public.board_pace_rows('UTC') where user_id=$1", [uid(99)]))[0].today_ms), 0,
    'legacy totals never rank a member');
  await as(1);
  await db.query(`update public.public_pace set today_ms=999999999,week_ms=999999999,month_ms=999999999 where user_id=$1`, [uid(1)]);
  assert.equal(Number((await query('select today_ms from public.public_pace where user_id=$1', [uid(1)]))[0].today_ms), 0);
  assert.equal(Number((await query('select today_ms from public.public_pace where user_id=$1', [uid(99)]))[0].today_ms), 123000,
    'later profile writes do not change other public rows');
  assert.equal(Number((await query("select today_ms from public.board_pace_rows('UTC') where user_id=$1", [uid(1)]))[0].today_ms), 0);
  await denied('select * from public.board_focus_sessions');
  await denied('select * from public.board_evidence_state');
  await denied("select * from public.board_focus_days('UTC')");

  const now = Date.now();
  const start = now - 75 * 60_000;
  const end = now - 15 * 60_000;
  const pauses = [{ start: start + 20 * 60_000, end: start + 35 * 60_000 }];
  await db.query('insert into public.user_backups(user_id,backup_data) values($1,$2)',
    [uid(1), backup([session('offline-1', start, end, 45 * 60_000, pauses)])]);
  let result = (await query('select * from public.reconcile_board_evidence()'))[0];
  assert.equal(result.status, 'current');
  assert.equal(result.accepted, 1);
  assert.equal(Number((await query("select month_ms from public.board_pace_rows('UTC') where user_id=$1", [uid(1)]))[0].month_ms), 45 * 60_000);
  result = (await query('select * from public.reconcile_board_evidence()'))[0];
  assert.equal(result.status, 'current');
  await db.exec('reset role');
  assert.equal(Number((await query('select count(*) as n from public.board_focus_sessions'))[0].n), 1);
  await as(1);

  const duplicate = session('offline-1', start, end, 45 * 60_000, pauses);
  const overlap = session('overlap', start + 10_000, end + 10_000, 60 * 60_000);
  const future = session('future', now + 60 * 60_000, now + 120 * 60_000, 60 * 60_000);
  await db.query('update public.user_backups set backup_data=$2 where user_id=$1',
    [uid(1), backup([duplicate, duplicate, overlap, future, { id: 'malformed' }])]);
  assert.equal(Number((await query("select month_ms from public.board_pace_rows('UTC') where user_id=$1", [uid(1)]))[0].month_ms), 0,
    'stale evidence is hidden until new backup revision is reconciled');
  result = (await query('select * from public.reconcile_board_evidence()'))[0];
  assert.equal(result.accepted, 1);
  assert.equal(result.rejected, 4);
  assert.equal(Number((await query("select month_ms from public.board_pace_rows('UTC') where user_id=$1", [uid(1)]))[0].month_ms), 45 * 60_000);

  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const midnightMs = midnight.getTime();
  const split = session('midnight', midnightMs - 10 * 60_000, midnightMs + 20 * 60_000,
    20 * 60_000, [{ start: midnightMs, end: midnightMs + 10 * 60_000 }]);
  await db.query('update public.user_backups set backup_data=$2 where user_id=$1',
    [uid(1), backup([split])]);
  result = (await query('select * from public.reconcile_board_evidence()'))[0];
  assert.equal(result.accepted, 1);
  await db.exec('reset role');
  const utcSlices = await query("select day_key,focus_ms from public.board_focus_days('UTC') where user_id=$1 order by day_key", [uid(1)]);
  const indiaSlices = await query("select day_key,focus_ms from public.board_focus_days('Asia/Kolkata') where user_id=$1 order by day_key", [uid(1)]);
  assert.equal(Number(utcSlices[0].focus_ms), 10 * 60_000, 'UTC midnight split excludes paused time');
  assert.equal(Number(indiaSlices[0].focus_ms), 20 * 60_000, 'India local day keeps midnight sitting together');
  await as(1);

  await db.query('delete from public.public_pace where user_id=$1', [uid(1)]);
  await db.exec('reset role');
  assert.equal(Number((await query('select count(*) as n from public.board_focus_sessions where user_id=$1', [uid(1)]))[0].n), 0,
    'opt-out removes public evidence');
  await as(2);
  assert.equal((await query('select * from public.reconcile_board_evidence()'))[0].status, 'waiting_for_sync',
    'one account cannot reconcile another account backup');
  const kudosEnd = Date.now() - 60_000;
  await db.query('insert into public.user_backups(user_id,backup_data) values($1,$2)',
    [uid(2), backup([session('earned', kudosEnd - 2 * 60 * 60_000, kudosEnd, 2 * 60 * 60_000)])]);
  assert.equal((await query('select * from public.reconcile_board_evidence()'))[0].accepted, 1);
  const kudosTimezone = new Date().getUTCHours() < 2 ? 'Asia/Kolkata' : 'UTC';
  await as(3);
  await db.query('update public.public_pace set today_ms=999999999 where user_id=$1', [uid(3)]);
  await denied('select public.give_board_kudos($1,$2,$3)', [uid(3), 'today', kudosTimezone]);
  await query('select public.give_board_kudos($1,$2,$3)', [uid(2), 'today', kudosTimezone]);
  assert.equal(Number((await query('select count(*) as n from public.board_appreciations where to_user=$1', [uid(2)]))[0].n), 1,
    'kudos reads derived session evidence instead of uploaded totals');
  await db.exec('reset role');
  const springStart = Date.parse('2026-03-08T04:30:00Z');
  const springEnd = Date.parse('2026-03-08T07:30:00Z');
  const revision = (await query('select revision from public.user_backups where user_id=$1', [uid(2)]))[0].revision;
  await db.query(`insert into public.board_focus_sessions
    (user_id,session_id,start_ms,end_ms,net_ms,pauses,ledger_complete,backup_revision)
    values($1,'dst-boundary',$2,$3,$4,'[]',true,$5)`,
    [uid(2), springStart, springEnd, springEnd - springStart, revision]);
  const dstSlices = await query(`select day_key,focus_ms from public.board_focus_days('America/New_York')
    where user_id=$1 and day_key between '2026-03-07' and '2026-03-08' order by day_key`, [uid(2)]);
  assert.deepEqual(dstSlices.map((day) => Number(day.focus_ms)), [30 * 60_000, 150 * 60_000],
    'local-day split respects the spring DST transition');
  await as(2);
  await db.query("update public.user_backups set backup_data='broken JSON' where user_id=$1", [uid(2)]);
  assert.equal((await query('select * from public.reconcile_board_evidence()'))[0].status, 'invalid_backup');
  assert.equal((await query('select backup_data from public.user_backups where user_id=$1', [uid(2)]))[0].backup_data, 'broken JSON',
    'Board failure leaves the private backup untouched');
  assert.equal(Number((await query("select today_ms from public.board_pace_rows('UTC') where user_id=$1", [uid(2)]))[0].today_ms), 0,
    'invalid new revision cannot keep older public evidence ranked');
  await as(0);
  await denied("select * from public.board_pace_rows('UTC')");
  await denied('select * from public.reconcile_board_evidence()');
  await db.exec('reset role');
  await db.exec('set role anon');
  await denied("select * from public.board_pace_rows('UTC')");
  await denied('select * from public.reconcile_board_evidence()');
  await db.exec('reset role');
  const legacyBridge = await file('board_evidence_legacy_bridge.sql');
  await db.exec(legacyBridge);
  await db.exec(legacyBridge);
  await as(99);
  assert.equal(Number((await query('select today_ms from public.board_pace_rows() where user_id=$1', [uid(99)]))[0].today_ms), 123000,
    'installed clients retain their existing Board values during the audit');
  await db.query('update public.public_pace set today_ms=456000 where user_id=$1', [uid(99)]);
  assert.equal(Number((await query('select today_ms from public.board_pace_rows() where user_id=$1', [uid(99)]))[0].today_ms), 456000,
    'installed clients can keep publishing to the legacy Board during the audit');
  assert.equal(Number((await query("select today_ms from public.board_pace_rows('UTC') where user_id=$1", [uid(99)]))[0].today_ms), 0,
    'candidate Board ranking still excludes legacy client totals');
  await db.exec('reset role');
  await db.exec(migration);
  await as(99);
  assert.equal(Number((await query('select today_ms from public.board_pace_rows() where user_id=$1', [uid(99)]))[0].today_ms), 0,
    'rerunning the main migration cuts installed clients over to derived totals');
  await db.query('update public.public_pace set today_ms=999999999 where user_id=$1', [uid(99)]);
  assert.equal(Number((await query('select today_ms from public.public_pace where user_id=$1', [uid(99)]))[0].today_ms), 456000,
    'cutover restores the forged-total write guard');
  console.log('Board evidence SQL checks passed');
} catch (error) {
  console.error(error.message, error.code, error.position, error.where);
  process.exitCode = 1;
} finally {
  await db.close();
}
