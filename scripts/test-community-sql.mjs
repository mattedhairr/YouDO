// Isolated PostgreSQL verification, no network or production credentials.
// Install test runtime only: npm install --prefix node_modules/.cache/community-db-test --no-save --no-package-lock @electric-sql/pglite
// Run: node scripts/test-community-sql.mjs
import { PGlite } from '../node_modules/.cache/community-db-test/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const as = async (n) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [n ? id(n) : '']);
  await db.exec('set role authenticated');
};
const denied = async (sql, args = []) => {
  let failed = false;
  try { await db.query(sql, args); } catch { failed = true; }
  check(failed, `Expected denial: ${sql}`);
};

try {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    alter default privileges in schema public grant all on tables to authenticated;
    alter default privileges in schema public grant usage, select on sequences to authenticated;
  `);
  await db.exec(await readFile(new URL('../supabase/public_pace.sql', import.meta.url), 'utf8'));
  // PGlite includes gen_random_uuid in core, but does not bundle pgcrypto.
  // This is the only omitted statement; the application schema/RLS/RPCs run unchanged.
  const sql = (await readFile(new URL('../supabase/community.sql', import.meta.url), 'utf8'))
    .replace('create extension if not exists pgcrypto;', '');
  await db.exec(sql);
  // Reproduce the previously installed audit constraint before upgrading it.
  await db.exec(`
    alter table public.community_audit_log drop constraint community_audit_log_admin_id_fkey;
    alter table public.community_audit_log alter column admin_id set not null;
    alter table public.community_audit_log add constraint community_audit_log_admin_id_fkey
      foreign key (admin_id) references auth.users(id) on delete restrict;
  `);
  await db.exec(sql);
  check(true, 'whole migration runs twice');
  for (let n = 1; n <= 14; n++) {
    const todayMs = n < 4 ? (4 - n) * 60 * 60 * 1000 : 0;
    const weekMs = n < 4 ? (4 - n) * 7 * 60 * 60 * 1000 : 0;
    const monthMs = n < 4 ? (4 - n) * 30 * 60 * 60 * 1000 : 0;
    await db.query('insert into auth.users values ($1)', [id(n)]);
    await db.query(`insert into public.public_pace(user_id, display_name, today_ms, week_ms, month_ms, today_key, week_key, month_key, bar_hours)
      values ($1, $2, $3, $4, $5, public.community_today(), date_trunc('week', now() at time zone 'UTC')::date, date_trunc('month', now() at time zone 'UTC')::date, 1)`,
      [id(n), `Member ${n}`, todayMs, weekMs, monthMs]);
  }
  await db.query('insert into public.community_admins(user_id) values ($1)', [id(1)]);
  await as(5);
  await db.query('select public.post_community_message($1)', ['Keep going.']);
  const first = (await rows('select * from public.community_inbox()'))[0];
  check(first?.body === 'Keep going.', 'new message is delivered');
  await db.query('select public.read_community_messages($1)', [[first.id]]);
  check((await rows('select * from public.community_inbox()')).some((m) => m.id === first.id), 'reading does not shorten the 24-hour lifetime');
  await db.query('select public.post_community_message($1,$2)', ['Reply with context.', first.id]);
  const reply = (await rows("select * from public.community_inbox() where body='Reply with context.'"))[0];
  check(reply?.reply_to === first.id, 'reply references the delivered active message');
  await denied('insert into public.community_messages(author_id, body) values ($1, $2)', [id(1), 'Forged author']);
  await denied('insert into public.community_messages(author_id, body) values ($1, $2)', [id(5), 'Bypass rate limits']);
  await denied('select public.post_community_message($1)', ['https://spam.test']);
  await denied('select public.community_activity_summary()');
  await denied('select public.moderate_community_member($1, $2)', [id(2), 'ban']);
  check((await rows('select * from public.community_deliveries where user_id <> auth.uid()')).length === 0, 'read receipts are private');
  await denied('update public.community_deliveries set read_at = now()');
  await db.exec('reset role');
  await db.query("update public.community_messages set day_key = public.community_today() - 1 where id = $1", [first.id]);
  await as(6);
  check((await rows('select * from public.community_inbox()')).some((m) => m.id === first.id), 'message remains visible across midnight');
  await db.query('select public.read_community_messages($1)', [[first.id]]);
  check((await rows('select * from public.community_inbox()')).some((m) => m.id === first.id), 'message remains visible after reading on another account');
  await db.exec('reset role');
  const expired = (await rows("insert into public.community_messages(author_id,body,expires_at) values ($1,'Expired target',now()-interval '1 second') returning id", [id(5)]))[0].id;
  await as(5);
  check(!(await rows('select * from public.community_inbox()')).some((m) => m.id === expired), 'message disappears at its rolling expiry');
  await denied('select public.post_community_message($1,$2)', ['Late reply', expired]);
  await as(5);
  await db.query('select public.give_board_kudos($1, $2)', [id(2), 'today']);
  await db.query('select public.give_board_kudos($1, $2)', [id(2), 'today']);
  check((await rows("select * from public.community_inbox() where message_kind = 'kudos'")).length === 1, 'duplicate kudos makes one note');
  check((await rows('select * from public.board_appreciations where from_user = auth.uid()')).length === 1, 'duplicate kudos makes one acknowledgement');
  await db.exec('reset role');
  await db.query('update public.public_pace set today_ms=$2 where user_id=$1', [id(3), 60 * 60 * 1000 - 1]);
  await as(6);
  await denied('select public.give_board_kudos($1, $2)', [id(3), 'today']);
  await db.exec('reset role');
  await db.query('update public.public_pace set today_ms=$2 where user_id=$1', [id(3), 60 * 60 * 1000]);
  await db.query('update public.public_pace set today_ms=$2 where user_id=$1', [id(4), 60 * 60 * 1000]);
  await as(6);
  await denied('select public.give_board_kudos($1, $2)', [id(4), 'today']);
  await denied('select public.give_board_kudos($1, $2)', [id(5), 'today']);
  await denied('select public.give_board_kudos($1, $2)', [id(2), 'invalid']);
  await denied('insert into public.board_appreciations(from_user,to_user) values ($1,$2)', [id(5),id(4)]);
  await as(1);
  await db.query('select public.remove_community_message($1)', [first.id]);
  await as(7);
  check(!(await rows('select * from public.community_inbox($1)', [[first.id]])).some((m) => m.id === first.id), 'removed unread cannot resurface');
  await db.query('select public.read_community_messages($1)', [[first.id]]);
  await as(1);
  await db.query('select public.moderate_community_member($1,$2)', [id(7), 'ban']);
  await as(7);
  check((await rows('select * from public.community_inbox()')).length === 0, 'banned recipient cannot read inbox');
  await denied('select public.give_board_kudos($1,$2)', [id(2), 'week']);
  await as(1);
  await db.query('select public.set_community_settings(false,true, $1)', ['']);
  check((await rows("select action from public.community_audit_log where admin_id=auth.uid() order by id desc limit 1"))[0]?.action === 'settings.room.disabled', 'setting audit describes the changed control');
  const settingsAuditCount = Number((await rows("select count(*) as count from public.community_audit_log where admin_id=auth.uid()"))[0].count);
  await db.query('select public.set_community_settings(false,true, $1)', ['']);
  check(Number((await rows("select count(*) as count from public.community_audit_log where admin_id=auth.uid()"))[0].count) === settingsAuditCount, 'saving unchanged settings adds no audit clutter');
  const longBroadcast = 'A'.repeat(900);
  await db.query('select public.set_community_settings(false,true, $1)', [longBroadcast]);
  check((await rows('select announcement from public.community_settings where id=1'))[0]?.announcement === longBroadcast, 'admin broadcasts are not truncated');
  await as(8);
  await denied('select public.post_community_message($1)', ['Paused room']);
  await db.query('select public.give_board_kudos($1,$2)', [id(2),'month']);
  check(!(await rows('select * from public.community_inbox()')).some((m) => m.author_id === id(8)), 'paused room receives no kudos note');
  await db.exec('reset role');
  await db.exec(sql);
  await as(5);
  check(!(await rows('select * from public.community_inbox()')).some((m) => m.id === first.id), 'rerun does not resurrect read or removed messages');
  await db.exec('reset role');
  const old = (await rows("insert into public.community_messages(author_id,body,day_key,created_at,expires_at) values ($1,'Old unread',public.community_today()-9,now()-interval '9 days',now()-interval '8 days') returning id", [id(9)]))[0].id;
  await db.query("insert into public.community_messages(author_id,body) values ($1,'Trigger cleanup')", [id(9)]);
  check((await rows('select id from public.community_messages where id=$1', [old])).length === 0, 'expired messages beyond retention are pruned regardless of read state');
  const beforeJoin = (await rows("insert into public.community_messages(author_id,body) values ($1,'Before membership') returning id", [id(9)]))[0].id;
  await db.query('insert into auth.users values ($1)', [id(15)]);
  await db.query("insert into public.public_pace(user_id,display_name) values ($1,'New member')", [id(15)]);
  await as(15);
  check((await rows('select * from public.community_inbox($1)', [[beforeJoin]])).length === 0, 'new members cannot retrieve messages they were not sent');
  await db.exec('reset role');
  const reported = (await rows("insert into public.community_messages(author_id,body) values ($1,'Reported evidence') returning id", [id(9)]))[0].id;
  await db.query("insert into public.community_reports(message_id,reporter_id) values ($1,$2)", [reported,id(5)]);
  await db.query("update public.community_messages set day_key=public.community_today()-9,expires_at=now()-interval '8 days',removed_at=now() where id=$1", [reported]);
  await db.query("insert into public.community_messages(author_id,body) values ($1,'Retain open reports')", [id(9)]);
  check((await rows('select id from public.community_messages where id=$1', [reported])).length === 1, 'cleanup preserves unresolved moderation evidence');
  await as(5);
  await db.query('select public.give_board_kudos($1,$2)', [id(3),'week']);
  check((await rows('select * from public.board_appreciations where to_user=$1 and from_user=auth.uid()', [id(3)])).length === 1, 'weekly leader eligible');
  await db.exec('reset role');
  await db.query("update public.public_pace set today_key=public.community_today()-1,week_key='2000-01-03',month_key='2000-01-01' where user_id in ($1,$2,$3)", [id(1),id(2),id(3)]);
  await as(6);
  for (const period of ['today','week','month']) await denied('select public.give_board_kudos($1,$2)', [id(2),period]);
  await db.exec('reset role; set role anon');
  await denied('select public.community_inbox()');
  await denied('select public.give_board_kudos($1,$2)', [id(2),'today']);
  await db.exec('reset role');
  await db.query('insert into auth.users values ($1)', [id(16)]);
  await db.query('insert into public.community_admins(user_id) values ($1)', [id(16)]);
  await as(16);
  await db.query('select public.set_community_settings(false,true,$1)', ['Deletion fixture']);
  await db.exec('reset role');
  const auditId = (await rows('select id from public.community_audit_log where admin_id=$1', [id(16)]))[0].id;
  await db.query('delete from auth.users where id=$1', [id(16)]);
  check((await rows('select * from public.community_admins where user_id=$1', [id(16)])).length === 0, 'admin account deletion removes its role');
  check((await rows('select admin_id from public.community_audit_log where id=$1', [auditId]))[0]?.admin_id === null, 'admin deletion preserves audit history without a dangling identity');
  console.log(`PASS: ${checks} isolated PostgreSQL checks (schema, reruns, 24-hour messages, replies, Kudos, RLS, moderation).`);
} finally { await db.close(); }
