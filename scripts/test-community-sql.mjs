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
    await db.query('insert into auth.users values ($1)', [id(n)]);
    await db.query(`insert into public.public_pace(user_id, display_name, today_ms, week_ms, month_ms, today_key, week_key, month_key)
      values ($1, $2, $3, $3, $3, public.community_today(), date_trunc('week', now() at time zone 'UTC')::date, date_trunc('month', now() at time zone 'UTC')::date)`, [id(n), `Member ${n}`, n < 4 ? (4 - n) * 60_000 : 0]);
  }
  await db.query('insert into public.community_admins(user_id) values ($1)', [id(1)]);
  await as(5);
  await db.query('select public.post_community_message($1)', ['Keep going.']);
  const first = (await rows('select * from public.community_inbox()'))[0];
  check(first?.body === 'Keep going.', 'new message is delivered');
  await db.query('select public.read_community_messages($1)', [[first.id]]);
  check((await rows('select * from public.community_inbox()')).length === 0, 'read messages disappear on reopening');
  check((await rows('select * from public.community_inbox($1)', [[first.id]])).length === 1, 'read message remains during same visit');
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
  check((await rows('select * from public.community_inbox()')).some((m) => m.id === first.id), 'unread survives midnight for another account');
  await db.query('select public.read_community_messages($1)', [[first.id]]);
  check((await rows('select * from public.community_inbox($1)', [[first.id]])).length === 1, 'older catch-up stays open until close');
  check((await rows('select * from public.community_inbox()')).length === 0, 'older catch-up clears after reading');
  await as(5);
  await db.query('select public.give_board_kudos($1, $2)', [id(2), 'today']);
  await db.query('select public.give_board_kudos($1, $2)', [id(2), 'today']);
  check((await rows("select * from public.community_inbox() where message_kind = 'kudos'")).length === 1, 'duplicate kudos makes one note');
  check((await rows('select * from public.board_appreciations where from_user = auth.uid()')).length === 1, 'duplicate kudos makes one acknowledgement');
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
  await as(8);
  await denied('select public.post_community_message($1)', ['Paused room']);
  await db.query('select public.give_board_kudos($1,$2)', [id(2),'month']);
  check(!(await rows('select * from public.community_inbox()')).some((m) => m.author_id === id(8)), 'paused room receives no kudos note');
  await db.exec('reset role');
  await db.exec(sql);
  await as(5);
  check(!(await rows('select * from public.community_inbox()')).some((m) => m.id === first.id), 'rerun does not resurrect read or removed messages');
  await db.exec('reset role');
  const old = (await rows("insert into public.community_messages(author_id,body,day_key,created_at) values ($1,'Old unread',public.community_today()-9,now()-interval '9 days') returning id", [id(9)]))[0].id;
  await db.query("insert into public.community_messages(author_id,body) values ($1,'Trigger cleanup')", [id(9)]);
  check((await rows('select id from public.community_messages where id=$1', [old])).length === 1, 'cleanup preserves old unread deliveries');
  await db.query('insert into auth.users values ($1)', [id(15)]);
  await db.query("insert into public.public_pace(user_id,display_name) values ($1,'New member')", [id(15)]);
  await as(15);
  check((await rows('select * from public.community_inbox($1)', [[old]])).length === 0, 'new members cannot retrieve messages they were not sent');
  await db.exec('reset role');
  await db.query('update public.community_deliveries set read_at=now() where message_id=$1', [old]);
  await db.query("insert into public.community_messages(author_id,body) values ($1,'Cleanup after reading')", [id(9)]);
  check((await rows('select id from public.community_messages where id=$1', [old])).length === 0, 'read messages older than retention are pruned');
  const reported = (await rows("insert into public.community_messages(author_id,body) values ($1,'Reported evidence') returning id", [id(9)]))[0].id;
  await db.query("insert into public.community_reports(message_id,reporter_id) values ($1,$2)", [reported,id(5)]);
  await db.query("update public.community_messages set day_key=public.community_today()-9,removed_at=now() where id=$1", [reported]);
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
  console.log(`PASS: ${checks} isolated PostgreSQL checks (schema, reruns, unread, Kudos, RLS, moderation).`);
} finally { await db.close(); }
