// Isolated PostgreSQL checks for community_push.sql: which community chat and
// Admin Hub events send a push while the app is closed, to whom, and how each
// person's switches apply. pg_net is replaced by a recorder; nothing is sent.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SUPABASE_SETUP_ORDER } from '../../scripts/supabase-setup-order.mjs';

const db = new PGlite();
const id = (n) => `50000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
let checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; };
const sent = async () => rows('select body from net.calls order by id');
const clear = () => db.exec('delete from net.calls');
const say = (author, body, room = null, reply = null) =>
  rows('insert into public.community_messages(author_id,body,room_id,reply_to) values($1,$2,$3,$4) returning id', [author, body, room, reply]);
const prefer = (person, mode) =>
  db.query('insert into public.push_preferences(user_id,community_messages) values($1,$2) on conflict (user_id) do update set community_messages=excluded.community_messages', [person, mode]);

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
  await db.exec(await load('community_push'));
  check(true, 'community_push.sql is rerunnable on a full project');

  await db.query("insert into vault.decrypted_secrets values('project_url','https://example.supabase.co'),('push_webhook_secret',$1) on conflict do nothing", ['s'.repeat(64)]);
  // Asha, Ben, Chen and Dev are Board members; Eve is not.
  const people = ['asha', 'ben', 'chen', 'dev', 'eve'];
  for (let n = 1; n <= people.length; n++) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [id(n), `${people[n - 1]}@example.com`]);
    await db.query('insert into public.profiles(id,username,display_name) values($1,$2,$3) on conflict (id) do update set username=excluded.username, display_name=excluded.display_name', [id(n), people[n - 1], people[n - 1][0].toUpperCase() + people[n - 1].slice(1)]);
    if (n <= 4) await db.query('insert into public.public_pace(user_id,display_name) values($1,$2)', [id(n), people[n - 1]]);
  }
  const gate = id(80);
  const upsc = id(81);
  await db.query("insert into public.community_hashtags(id,label,normalized_label) values($1,'GATE-2027','gate2027'),($2,'UPSC-2027','upsc2027')", [gate, upsc]);
  for (const n of [1, 2, 3]) await db.query('insert into public.community_hashtag_memberships(user_id,hashtag_id) values($1,$2)', [id(n), gate]);
  await db.query('insert into public.community_hashtag_memberships(user_id,hashtag_id) values($1,$2)', [id(4), upsc]);
  await clear();

  // An ordinary message pushes to nobody by default: the dots show it in the app.
  await say(id(1), 'Good morning, revision at 9', gate);
  check((await sent()).length === 0, 'an ordinary hashtag message does not push by default');

  // @mention: the mentioned member, with the room's name, tagged per room.
  const [question] = await say(id(1), 'Can @ben explain Laplace?', gate);
  let calls = await sent();
  check(calls.length === 1 && calls[0].body.userIds.length === 1 && calls[0].body.userIds[0] === id(2), 'a mention notifies the mentioned member');
  check(calls[0].body.title === 'Asha mentioned you in #GATE-2027' && calls[0].body.body === 'Can @ben explain Laplace?', 'it says who, where and what');
  check(calls[0].body.data.type === 'community' && calls[0].body.data.room === gate && calls[0].body.data.tag === `community-${gate}`, 'it opens the room and updates in place');
  check(calls[0].body.data.channel === 'public-hub', 'it uses the Public Hub channel');

  // Reply: the author of the message replied to.
  await clear();
  await say(id(2), 'Sure, after lunch', gate, question.id);
  calls = await sent();
  check(calls.length === 1 && calls[0].body.userIds[0] === id(1) && calls[0].body.title === 'Ben replied in #GATE-2027', 'a reply notifies the author of the message');
  await clear();
  await say(id(1), 'Thanks @ben, see you', gate, question.id);
  check((await sent()).every((call) => !call.body.userIds.includes(id(1))), 'replying to your own message never notifies you');

  // Replied and mentioned at once: one notification, the reply.
  await clear();
  const [own] = await say(id(3), 'Who has the PYQ list?', gate);
  await clear();
  await say(id(1), '@chen I do', gate, own.id);
  calls = await sent();
  check(calls.length === 1 && calls[0].body.userIds.length === 1 && calls[0].body.title.startsWith('Asha replied'), 'someone both replied to and mentioned gets one notification');

  // The General room: mentions too.
  await clear();
  await say(id(4), 'Hello @asha and @eve', null);
  calls = await sent();
  check(calls.length === 1 && calls[0].body.userIds.length === 1 && calls[0].body.userIds[0] === id(1), 'only Board members are notified of a mention');
  check(calls[0].body.title === 'Dev mentioned you in Community' && calls[0].body.data.room === '' && calls[0].body.data.tag === 'community-general', 'General is "Community"');
  await clear();
  await say(id(4), 'write to x@asha.in', null);
  check((await sent()).length === 0, 'an address is not a mention');

  // "All messages": every new message in your own hashtag room, never others.
  await clear();
  await prefer(id(3), 'all');
  await prefer(id(4), 'all');
  await say(id(1), 'Break till 6', gate);
  calls = await sent();
  check(calls.length === 1 && calls[0].body.userIds.length === 1 && calls[0].body.userIds[0] === id(3), '"All messages" members of the room get every message');
  check(calls[0].body.title === '#GATE-2027' && calls[0].body.body === 'Asha: Break till 6', 'it names the room and the sender');
  await clear();
  await say(id(1), 'Hello everyone', null);
  check((await sent()).length === 0, '"All messages" never covers the General room');
  await clear();
  await say(id(1), '@chen mock at 9', gate);
  calls = await sent();
  check(calls.length === 1 && calls[0].body.title.includes('mentioned'), 'a mentioned "All messages" member gets the mention, once');

  // Off: nothing, mentions and replies included.
  await clear();
  await prefer(id(2), 'off');
  await say(id(1), '@ben ping', gate);
  check((await sent()).every((call) => !call.body.userIds.includes(id(2))), 'community notifications off silences mentions');
  const [fromBen] = await say(id(2), 'Notes are up', gate);
  await clear();
  await say(id(1), 'Thanks!', gate, fromBen.id);
  check((await sent()).every((call) => !call.body.userIds.includes(id(2))), 'and replies');
  const mode = await rows("select column_default from information_schema.columns where table_name='push_preferences' and column_name='community_messages'");
  check(String(mode[0].column_default).includes('mentions'), 'community chat defaults to mentions and replies');

  // A banned author pushes nothing.
  await clear();
  await db.query("insert into public.community_members(user_id,banned_at) values($1,now()) on conflict (user_id) do update set banned_at=now()", [id(4)]);
  await say(id(4), 'Hi @asha', null);
  check((await sent()).length === 0, 'a banned member pushes nothing');

  // Admin Hub: a request, a requester's answer, a report; never the person who caused it.
  await db.query('insert into public.community_admins(user_id) values($1)', [id(1)]);
  await clear();
  const [request] = await rows("insert into public.community_hashtag_requests(requester_id,exam_name,normalized_exam) values($1,'CAT 2027','cat2027') returning id", [id(3)]);
  calls = await sent();
  check(calls.length === 1 && calls[0].body.userIds.length === 1 && calls[0].body.userIds[0] === id(1), 'a new hashtag request notifies the admins');
  check(calls[0].body.title === 'New hashtag request' && calls[0].body.data.type === 'admin_request' && calls[0].body.data.channel === 'admin-hub', 'on the Admin Hub channel');
  await clear();
  await db.query("update public.community_hashtag_requests set status='waiting', admin_response='Which year?' where id=$1", [request.id]);
  check((await sent()).every((call) => call.body.data.type !== 'admin_reply'), 'an admin asking does not notify admins');
  await clear();
  await db.query("update public.community_hashtag_requests set status='open', details='[Reply] 2027' where id=$1", [request.id]);
  calls = await sent();
  check(calls.length === 1 && calls[0].body.data.type === 'admin_reply' && calls[0].body.title === 'Support chat reply', 'a requester answering notifies the admins');
  await clear();
  const [reported] = await say(id(2), 'Spam spam', gate);
  await clear();
  await db.query("insert into public.community_reports(message_id,reporter_id,reason) values($1,$2,'Spam')", [reported.id, id(3)]);
  calls = await sent();
  check(calls.length === 1 && calls[0].body.data.type === 'admin_report' && calls[0].body.userIds[0] === id(1), 'a report notifies the admins');
  await clear();
  await db.query("insert into public.community_reports(message_id,reporter_id,reason) values($1,$2,'Spam')", [reported.id, id(1)]);
  check((await sent()).length === 0, 'an admin reporting does not notify themselves');
  await clear();
  await db.query('insert into public.push_preferences(user_id,admin_reports) values($1,false) on conflict (user_id) do update set admin_reports=false', [id(1)]);
  await db.query("insert into public.community_reports(message_id,reporter_id,reason) values($1,$2,'Rude')", [reported.id, id(2)]);
  check((await sent()).length === 0, 'an admin can turn report notifications off');

  console.log(`PASS: ${checks} isolated PostgreSQL checks for community and Admin Hub pushes (who, when, switches).`);
} finally {
  await db.close();
}
