// Isolated PostgreSQL checks for community_room_members.sql: who an exam
// hashtag room lists, in what order, and each person's friend status as seen
// by the caller. Every person here is made up.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SUPABASE_SETUP_ORDER } from '../../scripts/supabase-setup-order.mjs';

const db = new PGlite();
const id = (n) => `80000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
let checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; };
const as = async (n) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [n ? id(n) : '']);
  await db.exec(n ? 'set role authenticated' : 'set role anon');
};
const fails = async (sql, args, label) => {
  let error = null;
  try { await db.query(sql, args); } catch (caught) { error = caught; }
  check(error !== null, label);
  return error?.message ?? '';
};
const list = async (room) => (await rows('select public.community_room_members($1) as r', [room]))[0].r;

try {
  const harness = (await readFile(new URL('./test-full-setup-sql.mjs', import.meta.url), 'utf8')).match(/await db\.exec\(`([\s\S]*?)`\);/)[1];
  await db.exec(harness);
  const load = async (name) => (await readFile(new URL(`../../supabase/${name}.sql`, import.meta.url), 'utf8'))
    .replace('create extension if not exists pgcrypto;', '')
    .replace('create extension if not exists pg_net with schema extensions;', '');
  for (const name of SUPABASE_SETUP_ORDER) await db.exec(await load(name));
  check(SUPABASE_SETUP_ORDER.includes('community_room_members'), 'the file is part of the full setup');
  await db.exec(await load('community_room_members'));
  check(true, 'it runs again on a full project');

  // 1 Ravi (the caller), 2 Meera (friend), 3 Arjun (Ravi asked), 4 Priya (asked Ravi),
  // 5 Kavya (no relation), 6 banned, 7 in the room but not on the Board, 8 another room, 9 blocked, 10 no profile.
  const names = ['ravi_k', 'meera_s', 'arjun_up', 'priya_n', 'kavya_07', 'spam_bot', 'offboard', 'gate_guy', 'blocked_one', null];
  for (let n = 1; n <= names.length; n++) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [id(n), `p${n}@example.com`]);
    if (names[n - 1]) await db.query('insert into public.profiles(id,username,display_name,avatar_url) values($1,$2,$3,$4) on conflict (id) do update set username=excluded.username, display_name=excluded.display_name, avatar_url=excluded.avatar_url', [id(n), names[n - 1], names[n - 1], n === 2 ? 'https://example.com/m.webp' : '🦉']);
    if (n !== 7) await db.query('insert into public.public_pace(user_id,display_name,updated_at) values($1,$2,now() - ($3 || \' minutes\')::interval)', [id(n), `Board ${n}`, String(n)]);
  }
  await db.query("update public.profiles set is_backer=true where id=$1", [id(2)]);
  const upsc = id(81);
  const gate = id(82);
  await db.query("insert into public.community_hashtags(id,label,normalized_label) values($1,'UPSC-2027','upsc2027'),($2,'GATE-2027','gate2027')", [upsc, gate]);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 9, 10]) await db.query('insert into public.community_hashtag_memberships(user_id,hashtag_id) values($1,$2)', [id(n), upsc]);
  await db.query('insert into public.community_hashtag_memberships(user_id,hashtag_id) values($1,$2)', [id(8), gate]);
  await db.query("insert into public.friendships(requester_id,receiver_id,status) values($1,$2,'accepted'),($1,$3,'pending'),($4,$1,'pending'),($1,$5,'blocked')", [id(1), id(2), id(3), id(4), id(9)]);
  await db.query("insert into public.community_members(user_id,banned_at) values($1,now()) on conflict (user_id) do update set banned_at=now()", [id(6)]);

  await as(1);
  const result = await list(upsc);
  const byId = new Map(result.members.map((m) => [m.user_id, m]));
  check(result.total === 6 && result.members.length === 6, 'it lists the Board members of the room (6 of 9)');
  check(!byId.has(id(6)), 'banned members are left out');
  check(!byId.has(id(7)), 'people not on the Board are left out');
  check(!byId.has(id(8)), 'other rooms\' members are left out');
  check(!byId.has(id(9)), 'someone blocked either way is left out');
  check(result.members[0].user_id === id(1) && result.members[0].relation === 'self', 'you come first');
  check(result.members[1].user_id === id(2) && result.members[1].relation === 'friend', 'then your friends');
  check(byId.get(id(3)).relation === 'requested', 'someone you asked shows as requested');
  check(byId.get(id(4)).relation === 'incoming' && typeof byId.get(id(4)).request_id === 'string', 'someone who asked you shows with their request');
  check(byId.get(id(5)).relation === 'none' && byId.get(id(5)).request_id === null, 'everyone else can be added');
  check(byId.get(id(2)).avatar_url === 'https://example.com/m.webp' && byId.get(id(2)).is_backer === true, 'with their picture and backer ring');
  check(byId.get(id(5)).username === 'kavya_07', 'and their @username');
  check(byId.get(id(10)).username === null && byId.get(id(10)).display_name === 'Board 10', 'someone without a profile shows their Board name and no @username');
  const order = result.members.slice(2).map((m) => m.user_id);
  await db.exec('reset role');
  const expected = (await rows('select user_id from public.public_pace where user_id = any($1) order by updated_at desc', [order])).map((r) => r.user_id);
  check(order.join() === expected.join(), 'the rest by most recent activity');
  await as(1);
  check(!JSON.stringify(result).includes('@example.com'), 'no emails');

  await as(2);
  const seenByMeera = new Map((await list(upsc)).members.map((m) => [m.user_id, m.relation]));
  check(seenByMeera.get(id(1)) === 'friend' && seenByMeera.get(id(2)) === 'self', 'friendship counts both ways');
  await as(4);
  check(new Map((await list(upsc)).members.map((m) => [m.user_id, m.relation])).get(id(1)) === 'requested', 'Priya sees Ravi as requested');

  await as(7);
  await fails('select public.community_room_members($1)', [upsc], 'someone not on the Board cannot open the list');
  await as(6);
  await fails('select public.community_room_members($1)', [upsc], 'a banned member cannot open the list');
  await as(0);
  await fails('select public.community_room_members($1)', [upsc], 'nor can a signed-out visitor');
  await as(1);
  await fails('select public.community_room_members($1)', [id(99)], 'an unknown room is refused');
  await db.exec('reset role');
  await db.query('update public.community_hashtags set active=false where id=$1', [gate]);
  await as(8);
  await fails('select public.community_room_members($1)', [gate], 'an archived room is refused');

  console.log(`Room members SQL: ${checks} checks passed.`);
} finally {
  await db.close();
}
